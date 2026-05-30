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
    default:
      return s;
  }
}
