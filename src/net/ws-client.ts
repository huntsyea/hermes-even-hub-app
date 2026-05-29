import { hello, parseServer, type ServerMsg } from "../protocol";

interface Opts { urls: string[]; token: string; }
interface Deps { WS?: typeof WebSocket; onMessage: (m: ServerMsg) => void; onStatus?: (s: string) => void; }

export class BridgeClient {
  private o: Opts;
  private d: Deps;
  private ws?: WebSocket;
  private idx = 0;
  private delay = 500;
  private alive = true;

  constructor(o: Opts, d: Deps) {
    this.o = o;
    this.d = d;
  }

  connect(): void {
    const WS = this.d.WS ?? WebSocket;
    const usable = this.o.urls.filter(Boolean);
    if (usable.length === 0) { this.d.onStatus?.("no url configured"); return; }
    const url = usable[this.idx % usable.length];
    this.d.onStatus?.(`connecting ${url}`);
    const ws = new WS(url);
    this.ws = ws as unknown as WebSocket;
    (ws as any).onopen = () => {
      this.delay = 500;
      this.d.onStatus?.("connected");
      (ws as any).send(hello(this.o.token, "g2"));
    };
    (ws as any).onmessage = (e: { data: string }) => {
      try { this.d.onMessage(parseServer(String(e.data))); } catch { /* ignore malformed */ }
    };
    (ws as any).onclose = () => {
      if (!this.alive) return;
      this.idx++;
      this.d.onStatus?.("reconnecting");
      setTimeout(() => this.connect(), this.delay);
      this.delay = Math.min(this.delay * 2, 8000);
    };
    (ws as any).onerror = () => (ws as any).close();
  }

  send(raw: string): void {
    if (this.ws && (this.ws as any).readyState === 1) (this.ws as any).send(raw);
  }

  close(): void {
    this.alive = false;
    (this.ws as any)?.close();
  }
}
