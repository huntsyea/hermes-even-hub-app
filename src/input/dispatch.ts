import type { AppState } from "../state/store";
import { sessionsNew, sessionsSwitch, textMsg } from "../protocol";
import { threadPages } from "../ui/stream";

export type Gesture = "click" | "doubleClick" | "scrollUp" | "scrollDown";

export type Effect =
  | { kind: "send"; frame: string }
  | { kind: "startMic" }
  | { kind: "stopMic" }
  | { kind: "exit" };

export interface DispatchResult { state: AppState; effects: Effect[]; }

const enterSession = (s: AppState, active: string | null): AppState => ({
  ...s, screen: "session", phase: "idle", stream: [], pending: null, turn: "idle",
  scrollPage: null,
  sessions: { ...s.sessions, active },
});

export function dispatch(s: AppState, g: Gesture, index?: number): DispatchResult {
  if (s.screen === "list") {
    if (g === "click") {
      const i = index ?? 0; // proto3 omits index 0 → undefined means the ＋New row
      if (i === 0) return { state: enterSession(s, null), effects: [{ kind: "send", frame: sessionsNew() }] };
      const item = s.sessions.items[i - 1];
      if (!item) return { state: s, effects: [] };
      return { state: enterSession(s, item.id), effects: [{ kind: "send", frame: sessionsSwitch(item.id) }] };
    }
    if (g === "doubleClick") return { state: s, effects: [{ kind: "exit" }] };
    return { state: s, effects: [] };
  }
  // screen === "session"
  if (s.phase === "idle") {
    if (g === "click") return { state: { ...s, phase: "recording" }, effects: [{ kind: "startMic" }] };
    if (g === "doubleClick") return { state: { ...s, screen: "list", phase: "idle", pending: null }, effects: [] };
    if (g === "scrollUp") {
      const pages = threadPages(s.stream);
      const cur = s.scrollPage === null ? pages.length - 1 : s.scrollPage;
      if (cur === 0) return { state: s, effects: [] }; // at first page → stay in follow mode
      return { state: { ...s, scrollPage: cur - 1 }, effects: [] };
    }
    if (g === "scrollDown") {
      if (s.scrollPage === null) return { state: s, effects: [] };
      const pages = threadPages(s.stream);
      const next = s.scrollPage + 1;
      return { state: { ...s, scrollPage: next >= pages.length - 1 ? null : next }, effects: [] };
    }
    return { state: s, effects: [] };
  }
  if (s.phase === "recording") {
    if (g === "click") return { state: { ...s, phase: "transcribing" }, effects: [{ kind: "stopMic" }] };
    if (g === "doubleClick") return { state: { ...s, phase: "idle" }, effects: [{ kind: "stopMic" }] };
    return { state: s, effects: [] };
  }
  if (s.phase === "transcribing") {
    if (g === "doubleClick") return { state: { ...s, phase: "idle" }, effects: [] };
    return { state: s, effects: [] };
  }
  if (s.phase === "review") {
    if (g === "click" && s.pending) {
      const text = s.pending.transcript;
      return {
        state: { ...s, stream: [...s.stream, { kind: "user", text }], pending: null, phase: "idle", turn: "thinking" },
        effects: [{ kind: "send", frame: textMsg(text) }],
      };
    }
    if (g === "scrollDown") return { state: { ...s, pending: null, phase: "idle" }, effects: [] };
    if (g === "doubleClick") return { state: { ...s, screen: "list", phase: "idle", pending: null }, effects: [] };
    return { state: s, effects: [] };
  }
  return { state: s, effects: [] };
}
