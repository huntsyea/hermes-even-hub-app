import type { AppState } from "../state/store";
import { pageOpen, sessionsNew, sessionsSwitch, textMsg, sessionsList } from "../protocol";
import { sessionForListIndex } from "../ui/session-list";
import { nextThreadViewportCursor, previousThreadViewportIndex } from "../ui/stream";
import { pageViewports } from "../ui/page-view";
import { extractLinks, toPageLinks } from "../util/links";
import { menuItems } from "../util/menu";

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
  history: { loadingFor: active, failedFor: null },
  sessions: { ...s.sessions, active },
});

export function dispatch(s: AppState, g: Gesture, index?: number): DispatchResult {
  if (s.screen === "list") {
    if (!s.sessionsLoaded) return { state: s, effects: [] };
    if (g === "click") {
      const i = index ?? 0; // proto3 omits index 0 → undefined means the ＋New row
      if (i === 0) return { state: enterSession(s, null), effects: [{ kind: "send", frame: sessionsNew() }] };
      const item = sessionForListIndex(s.sessions.items, i);
      if (!item) return { state: s, effects: [] };
      return { state: enterSession(s, item.id), effects: [{ kind: "send", frame: sessionsSwitch(item.id) }] };
    }
    if (g === "doubleClick") return { state: s, effects: [{ kind: "exit" }] };
    return { state: s, effects: [] };
  }
  if (s.screen === "menu") {
    if (g === "click") {
      const item = menuItems(s)[index ?? 0];
      if (!item || item.action === "back") return { state: { ...s, screen: "session" }, effects: [] };
      if (item.action === "speak")
        return { state: { ...s, screen: "session", phase: "recording", scrollPage: null }, effects: [{ kind: "startMic" }] };
      if (item.action === "links")
        return {
          state: { ...s, screen: "links", links: toPageLinks(extractLinks(s.stream)), linksFrom: "session" },
          effects: [],
        };
      // sessions
      return { state: { ...s, screen: "list", phase: "idle", pending: null }, effects: [{ kind: "send", frame: sessionsList() }] };
    }
    if (g === "doubleClick") return { state: { ...s, screen: "session" }, effects: [] };
    return { state: s, effects: [] };
  }
  if (s.screen === "links") {
    if (g === "click") {
      const i = index ?? 0; // proto3 omits index 0 → undefined means the back row
      if (i === 0)
        return { state: { ...s, screen: s.linksFrom === "page" && s.page ? "page" : "session" }, effects: [] };
      const link = s.links[i - 1];
      if (!link) return { state: s, effects: [] };
      // Following a link from a page pushes the current page onto the
      // back-stack so double-tap in the viewer walks history backwards.
      const pageStack = s.linksFrom === "page" && s.page ? [...s.pageStack, s.page] : s.pageStack;
      return {
        state: {
          ...s,
          screen: "page",
          pageStack,
          page: { url: link.url, title: "", text: "", images: [], links: [], loading: true, error: null, page: 0 },
        },
        effects: [{ kind: "send", frame: pageOpen(link.url) }],
      };
    }
    if (g === "doubleClick")
      return {
        state: { ...s, screen: "list", phase: "idle", pending: null, page: null, pageStack: [] },
        effects: [{ kind: "send", frame: sessionsList() }],
      };
    return { state: s, effects: [] };
  }
  if (s.screen === "page") {
    if (g === "doubleClick") {
      if (s.pageStack.length) {
        const prev = s.pageStack[s.pageStack.length - 1];
        return { state: { ...s, page: prev, pageStack: s.pageStack.slice(0, -1) }, effects: [] };
      }
      return { state: { ...s, screen: "session", page: null }, effects: [] };
    }
    if (!s.page || s.page.loading || s.page.error) return { state: s, effects: [] };
    if (g === "click") {
      if (!s.page.links.length) return { state: s, effects: [] };
      return { state: { ...s, screen: "links", links: s.page.links, linksFrom: "page" }, effects: [] };
    }
    const total = pageViewports(s.page).length;
    if (total <= 1) return { state: s, effects: [] };
    if (g === "scrollDown")
      return { state: { ...s, page: { ...s.page, page: (s.page.page + 1) % total } }, effects: [] };
    if (g === "scrollUp")
      return { state: { ...s, page: { ...s.page, page: (s.page.page - 1 + total) % total } }, effects: [] };
    return { state: s, effects: [] };
  }
  // screen === "session"
  if (s.phase === "idle") {
    if (g === "click") return { state: { ...s, phase: "recording", scrollPage: null }, effects: [{ kind: "startMic" }] };
    if (g === "doubleClick") return { state: { ...s, screen: "menu", pending: null }, effects: [] };
    if (g === "scrollUp") {
      const prev = previousThreadViewportIndex(s.stream, s.scrollPage);
      return prev === s.scrollPage ? { state: s, effects: [] } : { state: { ...s, scrollPage: prev }, effects: [] };
    }
    if (g === "scrollDown") {
      const next = nextThreadViewportCursor(s.stream, s.scrollPage);
      return next === s.scrollPage ? { state: s, effects: [] } : { state: { ...s, scrollPage: next }, effects: [] };
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
        state: { ...s, stream: [...s.stream, { kind: "user", text }], pending: null, phase: "idle", turn: "thinking", scrollPage: null },
        effects: [{ kind: "send", frame: textMsg(text) }],
      };
    }
    if (g === "scrollDown") return { state: { ...s, pending: null, phase: "idle" }, effects: [] };
    if (g === "doubleClick") return { state: { ...s, screen: "list", phase: "idle", pending: null }, effects: [{ kind: "send", frame: sessionsList() }] };
    return { state: s, effects: [] };
  }
  return { state: s, effects: [] };
}
