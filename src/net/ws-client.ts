import { hello, parseServer, type ServerMsg } from "../protocol";
import type { ConnectionProfile } from "../storage/persist";

interface Deps {
  WS?: typeof WebSocket;
  onMessage: (m: ServerMsg) => void;
  onStatus?: (s: string) => void;
}

export class BridgeClient {
  private readonly d: Deps;
  private ws?: WebSocket;
  private profile?: ConnectionProfile;
  private delay = 500;
  private alive = false;
  private watchdog?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private lastRecv = 0;

  constructor(d: Deps) {
    this.d = d;
  }

  connect(profile: ConnectionProfile | null): void {
    if (!profile) {
      this.disconnect("not configured");
      return;
    }

    this.disconnect("reconnecting");
    this.profile = profile;
    this.alive = true;
    this.delay = 500;
    this.open();
  }

  disconnect(status = "disconnected"): void {
    this.alive = false;
    this.clearTimers();
    const ws = this.ws;
    this.ws = undefined;
    if (ws && (ws as any).readyState !== 3) (ws as any).close();
    this.d.onStatus?.(status);
  }

  send(raw: string): void {
    if (this.ws && (this.ws as any).readyState === 1) (this.ws as any).send(raw);
  }

  sendBinary(data: Uint8Array): void {
    if (this.ws && (this.ws as any).readyState === 1) (this.ws as any).send(data);
  }

  private open(): void {
    if (!this.profile) return;
    const WS = this.d.WS ?? WebSocket;
    const { url, token } = this.profile;
    this.d.onStatus?.(`connecting ${url}`);

    const ws = new WS(url);
    this.ws = ws as unknown as WebSocket;
    (ws as any).onopen = () => {
      this.delay = 500;
      this.d.onStatus?.("connected");
      (ws as any).send(hello(token, "g2"));
      this.lastRecv = Date.now();
      this.watchdog = setInterval(() => {
        if (Date.now() - this.lastRecv >= 45_000) {
          (this.ws as any)?.close();
        }
      }, 15_000);
    };
    (ws as any).onmessage = (e: { data: string }) => {
      this.lastRecv = Date.now();
      try { this.d.onMessage(parseServer(String(e.data))); } catch { /* ignore malformed */ }
    };
    (ws as any).onclose = (event?: { code?: number; reason?: string }) => {
      this.clearTimers();
      if (this.ws === ws) this.ws = undefined;
      if (!this.alive) return;
      if (isAuthClose(event)) {
        this.alive = false;
        this.d.onStatus?.("error: bridge token rejected");
        return;
      }
      this.d.onStatus?.("reconnecting");
      this.reconnectTimer = setTimeout(() => this.open(), this.delay);
      this.delay = Math.min(this.delay * 2, 8000);
    };
    (ws as any).onerror = () => (ws as any).close();
  }

  private clearTimers(): void {
    clearInterval(this.watchdog);
    clearTimeout(this.reconnectTimer);
    this.watchdog = undefined;
    this.reconnectTimer = undefined;
  }
}

function isAuthClose(event?: { code?: number; reason?: string }): boolean {
  const reason = event?.reason?.toLowerCase() ?? "";
  return event?.code === 1008 && (
    reason.includes("unauthorized")
    || reason.includes("bad hello")
    || reason.includes("token")
  );
}
