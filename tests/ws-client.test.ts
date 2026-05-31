import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BridgeClient } from "../src/net/ws-client";
import type { ConnectionProfile } from "../src/storage/persist";

const profile: ConnectionProfile = {
  url: "wss://node.tailnet.ts.net:8443",
  token: "tok",
  updatedAt: 1,
};

class FakeWS {
  static last: FakeWS | undefined;
  static opened: FakeWS[] = [];
  onopen?: () => void;
  onmessage?: (e: { data: string }) => void;
  onclose?: (event?: { code?: number; reason?: string }) => void;
  onerror?: () => void;
  sent: unknown[] = [];
  readyState = 1;

  constructor(public url: string) {
    FakeWS.last = this;
    FakeWS.opened.push(this);
  }

  send(d: unknown) { this.sent.push(d); }
  close(code?: number, reason?: string) { this.readyState = 3; this.onclose?.({ code, reason }); }
}

beforeEach(() => {
  FakeWS.last = undefined;
  FakeWS.opened = [];
});

describe("BridgeClient", () => {
  it("sends hello for the supplied runtime profile and surfaces parsed messages", () => {
    const msgs: unknown[] = [];
    const c = new BridgeClient({ WS: FakeWS as any, onMessage: (m) => msgs.push(m) });

    c.connect(profile);
    FakeWS.last!.onopen!();

    expect(FakeWS.last!.url).toBe("wss://node.tailnet.ts.net:8443");
    expect(JSON.parse(String(FakeWS.last!.sent[0]))).toEqual({ t: "hello", token: "tok", device: "g2" });
    FakeWS.last!.onmessage!({ data: JSON.stringify({ t: "active", id: "s1" }) });
    expect(msgs).toEqual([{ t: "active", id: "s1" }]);
  });

  it("does not open a socket without a profile", () => {
    const statuses: string[] = [];
    const c = new BridgeClient({ WS: FakeWS as any, onMessage: () => {}, onStatus: (s) => statuses.push(s) });

    c.connect(null);

    expect(FakeWS.opened).toEqual([]);
    expect(statuses).toEqual(["not configured"]);
  });

  it("send() forwards only when socket open", () => {
    const c = new BridgeClient({ WS: FakeWS as any, onMessage: () => {} });
    c.connect(profile);
    FakeWS.last!.onopen!();

    c.send(JSON.stringify({ t: "text", text: "hi" }));

    expect(FakeWS.last!.sent.some((s) => String(s).includes('"text":"hi"'))).toBe(true);
  });

  it("disconnect() stops reconnect after the socket closes", () => {
    vi.useFakeTimers();
    const c = new BridgeClient({ WS: FakeWS as any, onMessage: () => {} });
    c.connect(profile);
    FakeWS.last!.onopen!();

    c.disconnect();
    vi.runOnlyPendingTimers();

    expect(FakeWS.opened).toHaveLength(1);
    vi.useRealTimers();
  });

  it("stops reconnecting when the bridge rejects the token", () => {
    vi.useFakeTimers();
    const statuses: string[] = [];
    const c = new BridgeClient({
      WS: FakeWS as any,
      onMessage: () => {},
      onStatus: (s) => statuses.push(s),
    });
    c.connect(profile);
    FakeWS.last!.onopen!();

    FakeWS.last!.close(1008, "unauthorized");
    vi.runOnlyPendingTimers();

    expect(statuses).toContain("error: bridge token rejected");
    expect(FakeWS.opened).toHaveLength(1);
    vi.useRealTimers();
  });

  it("ignores malformed inbound messages without throwing", () => {
    const msgs: unknown[] = [];
    const c = new BridgeClient({ WS: FakeWS as any, onMessage: (m) => msgs.push(m) });
    c.connect(profile);
    FakeWS.last!.onopen!();

    expect(() => FakeWS.last!.onmessage!({ data: "not json" })).not.toThrow();
    expect(msgs).toEqual([]);
  });
});

describe("BridgeClient watchdog", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "Date"] }); });
  afterEach(() => { vi.useRealTimers(); });

  it("watchdog closes socket after 45s of silence", () => {
    const c = new BridgeClient({ WS: FakeWS as any, onMessage: () => {} });
    c.connect(profile);
    const first = FakeWS.last!;
    first.onopen!();

    vi.advanceTimersByTime(46_000);

    expect(first.readyState).toBe(3);
  });

  it("watchdog resets on message and keeps the socket open", () => {
    const msgs: unknown[] = [];
    const c = new BridgeClient({ WS: FakeWS as any, onMessage: (m) => msgs.push(m) });
    c.connect(profile);
    FakeWS.last!.onopen!();

    vi.advanceTimersByTime(20_000);
    FakeWS.last!.onmessage!({ data: JSON.stringify({ t: "active", id: "s1" }) });
    vi.advanceTimersByTime(30_000);

    expect(FakeWS.last!.readyState).toBe(1);
  });
});
