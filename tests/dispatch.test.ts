import { describe, it, expect } from "vitest";
import { dispatch } from "../src/input/dispatch";
import { initialState, type AppState } from "../src/state/store";
import { sessionsNew, sessionsSwitch } from "../src/protocol";

function listWith(items: { id: string; title: string }[]): AppState {
  return { ...initialState(), sessions: { items: items.map((i) => ({ ...i, updated: 0 })), active: null } };
}

describe("dispatch: list", () => {
  it("index 0 (or undefined) creates + opens a new session", () => {
    const r = dispatch(listWith([{ id: "a", title: "A" }]), "click", undefined);
    expect(r.state.screen).toBe("session");
    expect(r.state.phase).toBe("idle");
    expect(r.state.stream).toEqual([]);
    expect(r.effects).toEqual([{ kind: "send", frame: sessionsNew() }]);
  });
  it("index 1 opens the first existing session", () => {
    const r = dispatch(listWith([{ id: "a", title: "A" }, { id: "b", title: "B" }]), "click", 1);
    expect(r.state.screen).toBe("session");
    expect(r.state.sessions.active).toBe("a");
    expect(r.effects).toEqual([{ kind: "send", frame: sessionsSwitch("a") }]);
  });
  it("double-press exits the app", () => {
    const r = dispatch(listWith([]), "doubleClick");
    expect(r.effects).toEqual([{ kind: "exit" }]);
    expect(r.state.screen).toBe("list");
  });
  it("scroll is a no-op on the list", () => {
    const r = dispatch(listWith([{ id: "a", title: "A" }]), "scrollUp");
    expect(r.effects).toEqual([]);
    expect(r.state.screen).toBe("list");
  });
});
