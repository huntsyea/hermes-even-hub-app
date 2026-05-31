import type { HistoryItem, ServerMsg, SessionItem } from "../protocol";

export type Screen = "list" | "session";
export type Phase = "idle" | "recording" | "transcribing" | "review";
export type Turn = "idle" | "thinking" | "working";

export type StreamItem = HistoryItem;

export interface AppState {
  screen: Screen;
  phase: Phase;
  conn: string;
  sessions: { items: SessionItem[]; active: string | null };
  sessionsLoaded: boolean;
  history: { loadingFor: string | null; failedFor: string | null };
  stream: StreamItem[];
  pending: { transcript: string } | null;
  turn: Turn;
  scrollPage: number | null; // null = follow latest viewport; number = measured viewport index (held)
}

export function initialState(): AppState {
  return {
    screen: "list",
    phase: "idle",
    conn: "connecting",
    sessions: { items: [], active: null },
    sessionsLoaded: false,
    history: { loadingFor: null, failedFor: null },
    stream: [],
    pending: null,
    turn: "idle",
    scrollPage: null,
  };
}

// Assistant output before the first user item is the session banner (model,
// cwd, …); after the user has spoken it is normal assistant text. Either kind
// extends its own trailing segment so streamed deltas coalesce.
function appendStream(stream: StreamItem[], delta: string): StreamItem[] {
  const kind: "assistant" | "banner" =
    stream.some((it) => it.kind === "user") ? "assistant" : "banner";
  const last = stream[stream.length - 1];
  if (last && last.kind === kind) {
    return [...stream.slice(0, -1), { kind, text: last.text + delta }];
  }
  return [...stream, { kind, text: delta }];
}

function replaceAssistantSnapshot(stream: StreamItem[], text: string): StreamItem[] {
  const kind: "assistant" | "banner" =
    stream.some((it) => it.kind === "user") ? "assistant" : "banner";
  const last = stream[stream.length - 1];
  if (last && last.kind === kind) {
    return [...stream.slice(0, -1), { kind, text }];
  }
  return [...stream, { kind, text }];
}

function patchTool(stream: StreamItem[], name: string, ok: boolean): StreamItem[] {
  for (let i = stream.length - 1; i >= 0; i--) {
    const it = stream[i];
    if (it.kind === "tool" && it.running && it.name === name) {
      const patched: StreamItem = { kind: "tool", name: it.name, label: it.label, running: false, ok };
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
      return {
        ...s,
        sessionsLoaded: true,
        sessions: {
          items: m.items,
          active: isHistoryLoading(s) ? s.sessions.active : m.active,
        },
      };
    case "active":
      return {
        ...s,
        sessions: { ...s.sessions, active: m.id },
        history: { loadingFor: m.id, failedFor: null },
      };
    case "history":
      if (m.id !== s.sessions.active && m.id !== s.history.loadingFor) return s;
      return {
        ...s,
        sessions: { ...s.sessions, active: m.id },
        history: { loadingFor: null, failedFor: m.ok === false ? m.id : null },
        stream: m.items,
        pending: null,
        phase: "idle",
        turn: "idle",
        scrollPage: null,
      };
    case "error":
      return { ...s, conn: `error: ${m.msg}` };
    case "assistant.delta":
      return { ...s, history: { loadingFor: null, failedFor: null }, stream: appendStream(s.stream, m.text), scrollPage: null };
    case "assistant":
      return { ...s, history: { loadingFor: null, failedFor: null }, stream: replaceAssistantSnapshot(s.stream, m.text), scrollPage: null };
    case "tool.start":
      return {
        ...s,
        history: { loadingFor: null, failedFor: null },
        stream: [...s.stream, { kind: "tool", name: m.name, label: m.label, running: true }],
        turn: "working",
        scrollPage: null,
      };
    case "tool.end":
      return { ...s, stream: patchTool(s.stream, m.name, m.ok) };
    case "turn.done":
      return { ...s, turn: "idle" };
    case "transcript":
      if (s.phase !== "transcribing") return s;
      return m.text.trim()
        ? { ...s, pending: { transcript: m.text }, phase: "review", scrollPage: null }
        : { ...s, phase: "idle" };
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
      if (isHistoryLoading(s)) return "loading session...";
      if (isHistoryUnavailable(s)) return "history unavailable";
      if (s.turn === "working") {
        for (let i = s.stream.length - 1; i >= 0; i--) {
          const it = s.stream[i];
          if (it.kind === "tool" && it.running) return `working… (${it.name})`;
        }
        return "working…";
      }
      return s.turn === "thinking" ? "thinking…" : "ready";
    }
  }
}

export function connDot(conn: string): string {
  return conn === "connected" ? "●" : "◌";
}

export function isHistoryLoading(s: AppState): boolean {
  return Boolean(s.sessions.active && s.history.loadingFor === s.sessions.active);
}

export function isHistoryUnavailable(s: AppState): boolean {
  return Boolean(s.sessions.active && s.history.failedFor === s.sessions.active);
}
