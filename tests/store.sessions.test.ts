import { describe, it, expect } from "vitest";
import { initialState, reduce, selectSessionId, setView } from "../src/state/store";

describe("sessions store helpers", () => {
  it("resolves a list index to a session id", () => {
    const s = reduce(initialState(), { t: "sessions", items: [
      { id: "a", title: "A", updated: 1 }, { id: "b", title: "B", updated: 2 },
    ], active: "a" });
    expect(selectSessionId(s, 1)).toBe("b");
    expect(selectSessionId(s, 0)).toBe("a");
    expect(selectSessionId(s, 9)).toBeUndefined();
  });
  it("setView toggles the view without touching sessions/chat", () => {
    let s = reduce(initialState(), { t: "assistant", text: "hi" });
    s = setView(s, "sessions");
    expect(s.view).toBe("sessions");
    expect(s.chat.assistant).toBe("hi");
    expect(setView(s, "chat").view).toBe("chat");
  });
});
