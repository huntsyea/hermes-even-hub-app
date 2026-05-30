import type { AppState } from "../state/store";
import { sessionsNew, sessionsSwitch } from "../protocol";

export type Gesture = "click" | "doubleClick" | "scrollUp" | "scrollDown";

export type Effect =
  | { kind: "send"; frame: string }
  | { kind: "startMic" }
  | { kind: "stopMic" }
  | { kind: "exit" };

export interface DispatchResult { state: AppState; effects: Effect[]; }

const enterSession = (s: AppState, active: string | null): AppState => ({
  ...s, screen: "session", phase: "idle", stream: [], pending: null, turn: "idle",
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
  return { state: s, effects: [] };
}
