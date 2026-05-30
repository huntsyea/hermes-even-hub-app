import { describe, it, expect } from "vitest";
import { dispatch } from "../src/input/dispatch";
import { initialState, type AppState } from "../src/state/store";
import { sessionsNew, sessionsSwitch, textMsg, sessionsList } from "../src/protocol";
import { threadPages } from "../src/ui/stream";

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

function session(phase: AppState["phase"]): AppState {
  return { ...initialState(), screen: "session", phase };
}

describe("dispatch: session idle", () => {
  it("tap starts recording", () => {
    const r = dispatch(session("idle"), "click");
    expect(r.state.phase).toBe("recording");
    expect(r.effects).toEqual([{ kind: "startMic" }]);
  });
  it("double-press returns to the list", () => {
    const r = dispatch(session("idle"), "doubleClick");
    expect(r.state.screen).toBe("list");
    expect(r.effects).toEqual([{ kind: "send", frame: sessionsList() }]);
  });
});

describe("dispatch: session recording", () => {
  it("tap stops + moves to transcribing", () => {
    const r = dispatch(session("recording"), "click");
    expect(r.state.phase).toBe("transcribing");
    expect(r.effects).toEqual([{ kind: "stopMic" }]);
  });
  it("double-press cancels back to idle (still stops the mic)", () => {
    const r = dispatch(session("recording"), "doubleClick");
    expect(r.state.phase).toBe("idle");
    expect(r.effects).toEqual([{ kind: "stopMic" }]);
  });
});

function review(transcript: string): AppState {
  return { ...initialState(), screen: "session", phase: "review", pending: { transcript } };
}

describe("dispatch: session review", () => {
  it("tap sends: pushes a user item, clears pending, thinks", () => {
    const r = dispatch(review("add dark mode"), "click");
    expect(r.state.stream).toEqual([{ kind: "user", text: "add dark mode" }]);
    expect(r.state.pending).toBeNull();
    expect(r.state.phase).toBe("idle");
    expect(r.state.turn).toBe("thinking");
    expect(r.effects).toEqual([{ kind: "send", frame: textMsg("add dark mode") }]);
  });
  it("swipe-down redoes: clears pending, no send, stream untouched", () => {
    const r = dispatch(review("oops"), "scrollDown");
    expect(r.state.pending).toBeNull();
    expect(r.state.phase).toBe("idle");
    expect(r.state.stream).toEqual([]);
    expect(r.effects).toEqual([]);
  });
  it("double-press discards and returns to the list", () => {
    const r = dispatch(review("oops"), "doubleClick");
    expect(r.state.screen).toBe("list");
    expect(r.state.pending).toBeNull();
    expect(r.effects).toEqual([{ kind: "send", frame: sessionsList() }]);
  });
});

describe("dispatch: session transcribing", () => {
  it("double-press escapes a stuck transcribing back to idle", () => {
    const r = dispatch(session("transcribing"), "doubleClick");
    expect(r.state.phase).toBe("idle");
    expect(r.effects).toEqual([]);
  });
  it("tap/scroll are no-ops while transcribing", () => {
    expect(dispatch(session("transcribing"), "click").state.phase).toBe("transcribing");
    expect(dispatch(session("transcribing"), "scrollDown").effects).toEqual([]);
  });
});

function longSession(): AppState {
  const big = "x".repeat(800); // ~3 pages at the 360-char budget
  return {
    ...initialState(),
    screen: "session",
    phase: "idle",
    stream: [{ kind: "user", text: "hi" }, { kind: "assistant", text: big }],
  };
}

describe("dispatch: session idle scrolling", () => {
  it("scrollUp from follow moves to the second-to-last page", () => {
    const pages = threadPages(longSession().stream);
    const r = dispatch(longSession(), "scrollUp");
    expect(r.state.scrollPage).toBe(pages.length - 2);
    expect(r.effects).toEqual([]);
  });
  it("scrollUp clamps at the first page", () => {
    const r = dispatch({ ...longSession(), scrollPage: 0 }, "scrollUp");
    expect(r.state.scrollPage).toBe(0);
  });
  it("scrollDown to the last page resumes follow (null)", () => {
    const pages = threadPages(longSession().stream);
    const r = dispatch({ ...longSession(), scrollPage: pages.length - 2 }, "scrollDown");
    expect(r.state.scrollPage).toBeNull();
  });
  it("scrollDown while already following is a no-op", () => {
    const r = dispatch({ ...longSession(), scrollPage: null }, "scrollDown");
    expect(r.state.scrollPage).toBeNull();
  });
  it("scrollUp on a single-page stream stays in follow mode (no-op)", () => {
    const s: AppState = {
      ...initialState(), screen: "session", phase: "idle",
      stream: [{ kind: "user", text: "hi" }],
    };
    const r = dispatch(s, "scrollUp");
    expect(r.state.scrollPage).toBeNull();
  });
});
