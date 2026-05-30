import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BridgeClient } from "../src/net/ws-client";

class FakeWS {
  static last: FakeWS;
  onopen?: () => void;
  onmessage?: (e: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  sent: string[] = [];
  readyState = 1;
  constructor(public url: string) { FakeWS.last = this; }
  send(d: string) { this.sent.push(d); }
  close() { this.readyState = 3; this.onclose?.(); }
}

describe("BridgeClient", () => {
  it("sends hello on open and surfaces parsed messages", () => {
    const msgs: any[] = [];
    const c = new BridgeClient(
      { urls: ["ws://x"], token: "tok" },
      { WS: FakeWS as any, onMessage: (m) => msgs.push(m) },
    );
    c.connect();
    FakeWS.last.onopen!();
    expect(JSON.parse(FakeWS.last.sent[0])).toEqual({ t: "hello", token: "tok", device: "g2" });
    FakeWS.last.onmessage!({ data: JSON.stringify({ t: "active", id: "s1" }) });
    expect(msgs).toEqual([{ t: "active", id: "s1" }]);
  });

  it("send() forwards only when socket open", () => {
    const c = new BridgeClient({ urls: ["ws://x"], token: "t" }, { WS: FakeWS as any, onMessage: () => {} });
    c.connect();
    FakeWS.last.onopen!();
    c.send(JSON.stringify({ t: "text", text: "hi" }));
    expect(FakeWS.last.sent.some((s) => s.includes('"text":"hi"'))).toBe(true);
  });

  it("ignores malformed inbound messages without throwing", () => {
    const msgs: any[] = [];
    const c = new BridgeClient({ urls: ["ws://x"], token: "t" }, { WS: FakeWS as any, onMessage: (m) => msgs.push(m) });
    c.connect();
    FakeWS.last.onopen!();
    expect(() => FakeWS.last.onmessage!({ data: "not json" })).not.toThrow();
    expect(msgs).toEqual([]);
  });
});

describe("BridgeClient watchdog", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "Date"] }); });
  afterEach(() => { vi.useRealTimers(); });

  it("watchdog closes socket after 45s of silence", () => {
    const c = new BridgeClient(
      { urls: ["ws://x"], token: "t" },
      { WS: FakeWS as any, onMessage: () => {} },
    );
    c.connect();
    const first = FakeWS.last; // capture before reconnect creates a new one
    first.onopen!();
    // Advance past 45s without any messages — watchdog should fire
    vi.advanceTimersByTime(46_000);
    expect(first.readyState).toBe(3); // original socket closed
  });

  it("watchdog resets on message — socket stays open after 30s", () => {
    const msgs: any[] = [];
    const c = new BridgeClient(
      { urls: ["ws://x"], token: "t" },
      { WS: FakeWS as any, onMessage: (m) => msgs.push(m) },
    );
    c.connect();
    FakeWS.last.onopen!();
    // Advance 20s, then receive a message
    vi.advanceTimersByTime(20_000);
    FakeWS.last.onmessage!({ data: JSON.stringify({ t: "active", id: "s1" }) });
    // Advance another 30s (total 50s from open, but only 30s since last message)
    vi.advanceTimersByTime(30_000);
    // Should still be open (45s window not yet exceeded from last message)
    expect(FakeWS.last.readyState).toBe(1);
  });
});
