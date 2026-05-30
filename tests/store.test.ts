import { describe, it, expect } from "vitest";
import { initialState, reduce, setView } from "../src/state/store";

describe("store", () => {
  it("initialState has recording: false", () => {
    expect(initialState().recording).toBe(false);
  });

  it("replaces assistant text on each assistant frame", () => {
    let s = initialState();
    s = reduce(s, { t: "assistant", text: "he" });
    s = reduce(s, { t: "assistant", text: "hello" });
    expect(s.chat.assistant).toBe("hello");
  });
  it("tracks tool status", () => {
    let s = reduce(initialState(), { t: "tool.start", name: "bash", emoji: "⚙" });
    expect(s.chat.tool).toEqual({ name: "bash", emoji: "⚙", running: true });
    s = reduce(s, { t: "tool.end", name: "bash", ok: true });
    expect(s.chat.tool?.running).toBe(false);
  });
  it("stores sessions and active id", () => {
    const s = reduce(initialState(), {
      t: "sessions",
      items: [{ id: "s1", title: "One", updated: 1 }],
      active: "s1",
    });
    expect(s.sessions.items.length).toBe(1);
    expect(s.sessions.active).toBe("s1");
  });
  it("active resets chat and sets active id", () => {
    let s = reduce(initialState(), { t: "assistant", text: "old" });
    s = reduce(s, { t: "active", id: "s2" });
    expect(s.sessions.active).toBe("s2");
    expect(s.chat.assistant).toBe("");
  });
  it("turn.done marks done", () => {
    const s = reduce(initialState(), { t: "turn.done" });
    expect(s.chat.done).toBe(true);
  });
  it("turn.done clears the tool indicator so status can reach done", () => {
    let s = reduce(initialState(), { t: "tool.start", name: "terminal", emoji: "⚙" });
    s = reduce(s, { t: "tool.end", name: "terminal", ok: true });
    s = reduce(s, { t: "turn.done" });
    expect(s.chat.done).toBe(true);
    expect(s.chat.tool).toBeUndefined();
  });

  it("turn.done while view=sessions sets notify true", () => {
    const base = { ...initialState(), view: "sessions" as const };
    const s = reduce(base, { t: "turn.done" });
    expect(s.notify).toBe(true);
  });

  it("turn.done while view=chat keeps notify false", () => {
    const base = initialState(); // view is "chat" by default
    const s = reduce(base, { t: "turn.done" });
    expect(s.notify).toBe(false);
  });

  it("setView to chat clears notify", () => {
    const base = { ...initialState(), notify: true };
    const result = setView(base, "chat");
    expect(result.notify).toBe(false);
  });

  it("setView to sessions preserves notify", () => {
    const base = { ...initialState(), notify: true };
    const result = setView(base, "sessions");
    expect(result.notify).toBe(true);
  });
});
