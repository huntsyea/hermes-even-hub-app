import type { ServerMsg, SessionItem } from "../protocol";

export type View = "chat" | "sessions";

export interface ToolStatus { name: string; emoji?: string; running: boolean; }

export interface ChatState {
  assistant: string;
  transcript: string;
  tool?: ToolStatus;
  done: boolean;
}

export interface AppState {
  view: View;
  conn: string;
  sessions: { items: SessionItem[]; active: string | null };
  chat: ChatState;
}

export function initialState(): AppState {
  return {
    view: "chat",
    conn: "init",
    sessions: { items: [], active: null },
    chat: { assistant: "", transcript: "", done: false },
  };
}

export function reduce(s: AppState, m: ServerMsg): AppState {
  switch (m.t) {
    case "hello.ok":
      return { ...s, sessions: { ...s.sessions, active: m.active } };
    case "sessions":
      return { ...s, sessions: { items: m.items, active: m.active } };
    case "active":
      return { ...s, sessions: { ...s.sessions, active: m.id }, chat: initialState().chat };
    case "transcript":
      return { ...s, chat: { ...s.chat, transcript: m.text } };
    case "assistant":
      return { ...s, chat: { ...s.chat, assistant: m.text, done: false } };
    case "tool.start":
      return { ...s, chat: { ...s.chat, tool: { name: m.name, emoji: m.emoji, running: true } } };
    case "tool.end":
      return { ...s, chat: { ...s.chat, tool: s.chat.tool ? { ...s.chat.tool, running: false } : undefined } };
    case "turn.done":
      return { ...s, chat: { ...s.chat, done: true } };
    case "error":
      return { ...s, conn: `error: ${m.msg}` };
    default:
      return s;
  }
}
