export interface SessionItem {
  id: string;
  title: string;
  updated: number;
  tokens?: number;
}

export type HistoryItem =
  | { kind: "user"; text: string }
  | { kind: "tool"; name: string; label?: string; running: boolean; ok?: boolean }
  | { kind: "assistant"; text: string }
  | { kind: "banner"; text: string };

export interface PageImage {
  data: string; // base64 PNG (greyscale, ≤288×144)
  width: number;
  height: number;
}

export interface PageLink {
  url: string;
  label: string;
}

export type ServerMsg =
  | { t: "hello.ok"; caps: Record<string, unknown>; active: string | null }
  | { t: "sessions"; items: SessionItem[]; active: string | null }
  | { t: "active"; id: string }
  | { t: "history"; id: string; items: HistoryItem[]; ok?: boolean }
  | { t: "transcript"; text: string }
  | { t: "assistant"; text: string }
  | { t: "assistant.delta"; text: string }
  | { t: "tool.start"; name: string; label?: string; emoji?: string }
  | { t: "tool.end"; name: string; ok: boolean }
  | { t: "turn.done" }
  | { t: "page.data"; url: string; title: string; text: string; images: PageImage[]; links: PageLink[] }
  | { t: "page.error"; url: string; msg: string }
  | { t: "error"; msg: string };

const SERVER_TYPES = new Set([
  "hello.ok",
  "sessions",
  "active",
  "history",
  "transcript",
  "assistant",
  "assistant.delta",
  "tool.start",
  "tool.end",
  "turn.done",
  "page.data",
  "page.error",
  "error",
]);

export const hello = (token: string, device: string) =>
  JSON.stringify({ t: "hello", token, device });

export const sessionsList = () => JSON.stringify({ t: "sessions.list" });

export const sessionsSwitch = (id: string) =>
  JSON.stringify({ t: "sessions.switch", id });

export const sessionsNew = (title?: string) =>
  JSON.stringify({ t: "sessions.new", title });

export const textMsg = (text: string) => JSON.stringify({ t: "text", text });

export const stopMsg = () => JSON.stringify({ t: "stop" });

export const audioStart = () => JSON.stringify({ t: "audio.start" });
export const audioStop = () => JSON.stringify({ t: "audio.stop" });

export const pageOpen = (url: string) => JSON.stringify({ t: "page.open", url });

export function parseServer(raw: string): ServerMsg {
  const m = JSON.parse(raw);
  if (!m || typeof m.t !== "string" || !SERVER_TYPES.has(m.t))
    throw new Error(`bad server msg: ${raw}`);
  return m as ServerMsg;
}
