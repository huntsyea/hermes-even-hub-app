import type { ServerMsg, SessionItem } from "../protocol";

export type Screen = "list" | "session";
export type Phase = "idle" | "recording" | "transcribing" | "review";
export type Turn = "idle" | "thinking" | "working";

export type StreamItem =
  | { kind: "user"; text: string }
  | { kind: "tool"; name: string; running: boolean; ok?: boolean }
  | { kind: "assistant"; text: string };

export interface AppState {
  screen: Screen;
  phase: Phase;
  conn: string;
  sessions: { items: SessionItem[]; active: string | null };
  stream: StreamItem[];
  pending: { transcript: string } | null;
  turn: Turn;
}

export function initialState(): AppState {
  return {
    screen: "list",
    phase: "idle",
    conn: "connecting",
    sessions: { items: [], active: null },
    stream: [],
    pending: null,
    turn: "idle",
  };
}

function appendDelta(stream: StreamItem[], delta: string): StreamItem[] {
  const last = stream[stream.length - 1];
  if (last && last.kind === "assistant") {
    return [...stream.slice(0, -1), { kind: "assistant", text: last.text + delta }];
  }
  return [...stream, { kind: "assistant", text: delta }];
}

function patchTool(stream: StreamItem[], name: string, ok: boolean): StreamItem[] {
  for (let i = stream.length - 1; i >= 0; i--) {
    const it = stream[i];
    if (it.kind === "tool" && it.running && it.name === name) {
      const patched: StreamItem = { kind: "tool", name: it.name, running: false, ok };
      return [...stream.slice(0, i), patched, ...stream.slice(i + 1)];
    }
  }
  return stream;
}

export function reduce(s: AppState, m: ServerMsg): AppState {
  switch (m.t) {
    case "hello.ok":
      return { ...s, sessions: { ...s.sessions, active: m.active } };
    case "sessions":
      return { ...s, sessions: { items: m.items, active: m.active } };
    case "active":
      return { ...s, sessions: { ...s.sessions, active: m.id } };
    case "error":
      return { ...s, conn: `error: ${m.msg}` };
    case "assistant.delta":
      return { ...s, stream: appendDelta(s.stream, m.text) };
    case "tool.start":
      return { ...s, stream: [...s.stream, { kind: "tool", name: m.name, running: true }], turn: "working" };
    case "tool.end":
      return { ...s, stream: patchTool(s.stream, m.name, m.ok) };
    case "turn.done":
      return { ...s, turn: "idle" };
    case "transcript":
      return s.phase === "transcribing"
        ? { ...s, pending: { transcript: m.text }, phase: "review" }
        : s;
    default:
      return s;
  }
}

export function barText(s: AppState): string {
  switch (s.phase) {
    case "recording": return "🎤 recording…";
    case "transcribing": return "transcribing…";
    case "review": return "tap = send · swipe↓ = redo";
    case "idle":
    default: {
      if (s.turn === "working") {
        for (let i = s.stream.length - 1; i >= 0; i--) {
          const it = s.stream[i];
          if (it.kind === "tool" && it.running) return `working… (${it.name})`;
        }
        return "working…";
      }
      return s.turn === "thinking" ? "thinking…" : "ready for input";
    }
  }
}

export function connDot(conn: string): string {
  return conn === "connected" ? "●" : "◌";
}
