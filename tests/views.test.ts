import { describe, it, expect, vi } from "vitest";
import { getTextWidth } from "@evenrealities/pretext";
import { listRows, loadingText, renderList, renderSession } from "../src/ui/views";
import { initialState, type AppState } from "../src/state/store";

describe("listRows", () => {
  it("shows a non-actionable loading row until sessions hydrate", () => {
    expect(listRows(initialState())).toEqual(["loading sessions..."]);
  });

  it("prepends the ＋New row and sorts sessions newest-first", () => {
    const now = 200_000;
    const s: AppState = {
      ...initialState(),
      sessionsLoaded: true,
      sessions: {
        items: [
          { id: "old", title: "refactor parser", updated: now - 86_400 },
          { id: "new", title: "build the app", updated: now - 7200 },
        ],
        active: "new",
      },
    };
    expect(listRows(s, now)).toEqual([
      "＋ New session",
      "● 2h build the app",
      "  1d refactor parser",
    ]);
  });

  it("keeps server order when timestamps are equal", () => {
    const s: AppState = {
      ...initialState(),
      sessionsLoaded: true,
      sessions: {
        items: [
          { id: "a", title: "first", updated: 1 },
          { id: "b", title: "second", updated: 1 },
        ],
        active: null,
      },
    };
    expect(listRows(s, 1).slice(1)).toEqual(["  now first", "  now second"]);
  });

  it("uses a stable new-session fallback for untitled sessions", () => {
    const s: AppState = { ...initialState(), sessionsLoaded: true, sessions: { items: [{ id: "a", title: "   ", updated: 0 }], active: null } };
    expect(listRows(s, 1)).toEqual(["＋ New session", "  -- New session a"]);
  });

  it("truncates long rows to fit the native list width", () => {
    const s: AppState = {
      ...initialState(),
      sessionsLoaded: true,
      sessions: { items: [{ id: "a", title: "W".repeat(80), updated: 1 }], active: "a" },
    };
    const row = listRows(s, 1)[1];
    expect(row.endsWith("…")).toBe(true);
    expect(row.length).toBeLessThanOrEqual(64);
    expect(getTextWidth(row)).toBeLessThanOrEqual(576);
  });
});

describe("renderList", () => {
  it("renders loading as a text page until sessions hydrate", async () => {
    const bridge = { rebuildPageContainer: vi.fn(async () => {}) } as any;
    await renderList(bridge, { ...initialState(), conn: "connected" });
    const arg = bridge.rebuildPageContainer.mock.calls[0][0];
    expect(arg.listObject).toBeUndefined();
    expect(arg.textObject[0].content).toBe("loading sessions...\nwaiting for session list");
  });

  it("renders a native list after sessions hydrate", async () => {
    const bridge = { rebuildPageContainer: vi.fn(async () => {}) } as any;
    await renderList(bridge, {
      ...initialState(),
      sessionsLoaded: true,
      sessions: { items: [{ id: "a", title: "A", updated: 1 }], active: null },
    });
    const arg = bridge.rebuildPageContainer.mock.calls[0][0];
    expect(arg.textObject).toBeUndefined();
    expect(arg.listObject[0].itemContainer.itemName[0]).toBe("＋ New session");
  });

  it("includes connection status in loading text", () => {
    expect(loadingText({ ...initialState(), conn: "reconnecting" })).toBe("loading sessions...\nreconnecting");
  });
});

describe("renderSession", () => {
  it("fills header (title+dot), body (stream), status (bar)", async () => {
    const calls: Record<number, string> = {};
    const bridge = {
      textContainerUpgrade: vi.fn(async (u: any) => { calls[u.containerID] = u.content; }),
    } as any;
    const s: AppState = {
      ...initialState(), screen: "session", phase: "idle", conn: "connected", turn: "idle",
      sessions: { items: [{ id: "a", title: "build the app", updated: 0 }], active: "a" },
      stream: [{ kind: "user", text: "hi" }],
    };
    await renderSession(bridge, s);
    expect(calls[1]).toBe("build the app");      // IDS.header (title only)
    expect(calls[5]).toBe("●");                   // IDS.dot (far-right)
    expect(calls[2]).toBe("> hi");                // IDS.body
    expect(calls[3]).toBe("ready");               // IDS.status
  });
  it("shows loading text while session history is in flight", async () => {
    const calls: Record<number, string> = {};
    const bridge = { textContainerUpgrade: vi.fn(async (u: any) => { calls[u.containerID] = u.content; }) } as any;
    const s: AppState = {
      ...initialState(), screen: "session", phase: "idle", conn: "connected",
      sessions: { items: [{ id: "a", title: "A", updated: 0 }], active: "a" },
      history: { loadingFor: "a", failedFor: null },
    };
    await renderSession(bridge, s);
    expect(calls[2]).toBe("loading session...");
    expect(calls[3]).toBe("loading session...");
  });
  it("keeps an empty failed-history session usable", async () => {
    const calls: Record<number, string> = {};
    const bridge = { textContainerUpgrade: vi.fn(async (u: any) => { calls[u.containerID] = u.content; }) } as any;
    const s: AppState = {
      ...initialState(), screen: "session", phase: "idle", conn: "connected",
      sessions: { items: [{ id: "a", title: "A", updated: 0 }], active: "a" },
      history: { loadingFor: null, failedFor: "a" },
    };
    await renderSession(bridge, s);
    expect(calls[2]).toBe("tap to speak");
    expect(calls[3]).toBe("history unavailable");
  });
  it("shows the pending transcript as the next user line during review", async () => {
    const calls: Record<number, string> = {};
    const bridge = { textContainerUpgrade: vi.fn(async (u: any) => { calls[u.containerID] = u.content; }) } as any;
    const s: AppState = { ...initialState(), screen: "session", phase: "review", conn: "connected",
      sessions: { items: [{ id: "a", title: "A", updated: 0 }], active: "a" }, pending: { transcript: "add dark mode" } };
    await renderSession(bridge, s);
    expect(calls[2]).toBe("> add dark mode");
    expect(calls[3]).toBe("tap = send · swipe↓ = redo");
  });
  it("keeps the thread visible behind a pending transcript", async () => {
    const calls: Record<number, string> = {};
    const bridge = { textContainerUpgrade: vi.fn(async (u: any) => { calls[u.containerID] = u.content; }) } as any;
    const s: AppState = {
      ...initialState(), screen: "session", phase: "review", conn: "connected",
      sessions: { items: [{ id: "a", title: "A", updated: 0 }], active: "a" },
      stream: [{ kind: "user", text: "hi" }, { kind: "assistant", text: "Hello." }],
      pending: { transcript: "add dark mode" },
    };
    await renderSession(bridge, s);
    expect(calls[2]).toBe("> hi\nHello.\n> add dark mode");
  });
  it("renders the held page when scrollPage is an absolute index", async () => {
    const calls: Record<number, string> = {};
    const bridge = { textContainerUpgrade: vi.fn(async (u: any) => { calls[u.containerID] = u.content; }) } as any;
    const big = "x".repeat(800); // multiple measured viewport windows
    const s: AppState = {
      ...initialState(), screen: "session", phase: "idle", conn: "connected",
      sessions: { items: [{ id: "a", title: "A", updated: 0 }], active: "a" },
      stream: [{ kind: "user", text: "hi" }, { kind: "assistant", text: big }],
      scrollPage: 0,
    };
    const { threadPages } = await import("../src/ui/stream");
    await renderSession(bridge, s);
    expect(calls[2]).toBe(threadPages(s.stream)[0]); // IDS.body shows page 0
  });
  it("adds viewport position to the status line for long threads", async () => {
    const calls: Record<number, string> = {};
    const bridge = { textContainerUpgrade: vi.fn(async (u: any) => { calls[u.containerID] = u.content; }) } as any;
    const big = "x".repeat(800);
    const s: AppState = {
      ...initialState(), screen: "session", phase: "idle", conn: "connected",
      sessions: { items: [{ id: "a", title: "A", updated: 0 }], active: "a" },
      stream: [{ kind: "user", text: "hi" }, { kind: "assistant", text: big }],
      scrollPage: 0,
    };
    const { threadPages } = await import("../src/ui/stream");
    await renderSession(bridge, s);
    expect(calls[3]).toBe(`ready · 1/${threadPages(s.stream).length}`);
  });
});
