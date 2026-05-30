import { describe, it, expect, vi } from "vitest";
import { listRows, renderSession } from "../src/ui/views";
import { initialState, type AppState } from "../src/state/store";

describe("listRows", () => {
  it("prepends the ＋New row before truncated titles", () => {
    const s: AppState = { ...initialState(), sessions: { items: [{ id: "a", title: "build the app", updated: 0 }], active: "a" } };
    expect(listRows(s)).toEqual(["＋ New session", "build the app"]);
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
    expect(calls[1]).toBe("build the app  ●");   // IDS.header
    expect(calls[2]).toBe("> hi");                // IDS.body
    expect(calls[3]).toBe("ready for input");     // IDS.status
  });
  it("shows the pending transcript in the body during review", async () => {
    const calls: Record<number, string> = {};
    const bridge = { textContainerUpgrade: vi.fn(async (u: any) => { calls[u.containerID] = u.content; }) } as any;
    const s: AppState = { ...initialState(), screen: "session", phase: "review", conn: "connected",
      sessions: { items: [{ id: "a", title: "A", updated: 0 }], active: "a" }, pending: { transcript: "add dark mode" } };
    await renderSession(bridge, s);
    expect(calls[2]).toBe('"add dark mode"');
  });
});
