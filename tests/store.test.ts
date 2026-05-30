import { describe, it, expect } from "vitest";
import { initialState, reduce, barText, connDot, type AppState, type StreamItem } from "../src/state/store";

describe("initialState", () => {
  it("boots on the session list, idle, empty stream", () => {
    const s = initialState();
    expect(s.screen).toBe("list");
    expect(s.phase).toBe("idle");
    expect(s.stream).toEqual([]);
    expect(s.pending).toBeNull();
    expect(s.turn).toBe("idle");
    expect(s.sessions).toEqual({ items: [], active: null });
  });
});

describe("reduce: sessions", () => {
  it("sets items and active from a sessions message", () => {
    const s: AppState = initialState();
    const next = reduce(s, { t: "sessions", items: [{ id: "a", title: "A", updated: 1 }], active: "a" });
    expect(next.sessions.items).toHaveLength(1);
    expect(next.sessions.active).toBe("a");
  });
  it("sets active from hello.ok and active messages", () => {
    let s = reduce(initialState(), { t: "hello.ok", caps: {}, active: "x" });
    expect(s.sessions.active).toBe("x");
    s = reduce(s, { t: "active", id: "y" });
    expect(s.sessions.active).toBe("y");
  });
});

describe("reduce: stream", () => {
  it("assistant output BEFORE the first user item is a banner", () => {
    let s = initialState();
    s = reduce(s, { t: "assistant.delta", text: "model: x" });
    s = reduce(s, { t: "assistant.delta", text: "\ncwd: y" });
    expect(s.stream).toEqual([{ kind: "banner", text: "model: x\ncwd: y" }]);
  });
  it("assistant output AFTER a user item is assistant text", () => {
    let s: AppState = { ...initialState(), stream: [{ kind: "user", text: "hi" }] };
    s = reduce(s, { t: "assistant.delta", text: "It's" });
    s = reduce(s, { t: "assistant.delta", text: " Friday" });
    expect(s.stream).toEqual([
      { kind: "user", text: "hi" },
      { kind: "assistant", text: "It's Friday" },
    ]);
  });
  it("a full assistant frame after a user item appends assistant text", () => {
    let s: AppState = { ...initialState(), stream: [{ kind: "user", text: "hi" }] };
    s = reduce(s, { t: "assistant", text: "hello there" });
    expect(s.stream).toEqual([
      { kind: "user", text: "hi" },
      { kind: "assistant", text: "hello there" },
    ]);
  });
  it("a delta after a tool opens a NEW assistant segment", () => {
    let s: AppState = { ...initialState(), stream: [{ kind: "user", text: "hi" }] };
    s = reduce(s, { t: "assistant.delta", text: "Checking…" });
    s = reduce(s, { t: "tool.start", name: "terminal" });
    s = reduce(s, { t: "tool.end", name: "terminal", ok: true });
    s = reduce(s, { t: "assistant.delta", text: "Done." });
    expect(s.stream).toEqual([
      { kind: "user", text: "hi" },
      { kind: "assistant", text: "Checking…" },
      { kind: "tool", name: "terminal", running: false, ok: true },
      { kind: "assistant", text: "Done." },
    ]);
  });
  it("pushes a running tool on tool.start and sets turn=working", () => {
    let s = reduce(initialState(), { t: "tool.start", name: "terminal" });
    expect(s.turn).toBe("working");
    expect(s.stream).toEqual([{ kind: "tool", name: "terminal", running: true }]);
  });
  it("patches the matching running tool to done on tool.end", () => {
    let s = initialState();
    s = reduce(s, { t: "tool.start", name: "terminal" });
    s = reduce(s, { t: "tool.end", name: "terminal", ok: true });
    expect(s.stream).toEqual([{ kind: "tool", name: "terminal", running: false, ok: true }]);
  });
  it("sets turn=idle on turn.done", () => {
    let s = reduce(initialState(), { t: "tool.start", name: "x" });
    s = reduce(s, { t: "turn.done" });
    expect(s.turn).toBe("idle");
  });
  it("consecutive assistant deltas coalesce into one item", () => {
    let s = { ...initialState(), stream: [{ kind: "user", text: "hi" } as StreamItem] };
    s = reduce(s, { t: "assistant.delta", text: "First." });
    s = reduce(s, { t: "assistant.delta", text: "Second." });
    const assistant = s.stream.filter((i) => i.kind === "assistant");
    expect(assistant).toHaveLength(1);
    expect(assistant[0].kind === "assistant" && assistant[0].text).toBe("First.Second.");
  });
});

describe("reduce: transcript guard", () => {
  it("sets pending + review only when phase is transcribing", () => {
    const s = { ...initialState(), screen: "session" as const, phase: "transcribing" as const };
    const next = reduce(s, { t: "transcript", text: "add dark mode" });
    expect(next.pending).toEqual({ transcript: "add dark mode" });
    expect(next.phase).toBe("review");
  });
  it("ignores a transcript that arrives in any other phase (cancel path)", () => {
    const s = { ...initialState(), screen: "session" as const, phase: "idle" as const };
    const next = reduce(s, { t: "transcript", text: "stale" });
    expect(next.pending).toBeNull();
    expect(next.phase).toBe("idle");
  });
  it("drops an empty/whitespace transcript back to idle (nothing to review)", () => {
    const s = { ...initialState(), screen: "session" as const, phase: "transcribing" as const };
    const next = reduce(s, { t: "transcript", text: "   " });
    expect(next.phase).toBe("idle");
    expect(next.pending).toBeNull();
  });
  it("a non-empty transcript still goes to review", () => {
    const s = { ...initialState(), screen: "session" as const, phase: "transcribing" as const };
    const next = reduce(s, { t: "transcript", text: "hello" });
    expect(next.phase).toBe("review");
    expect(next.pending).toEqual({ transcript: "hello" });
  });
});

describe("barText", () => {
  const base = { ...initialState(), screen: "session" as const };
  it("recording / transcribing / review", () => {
    expect(barText({ ...base, phase: "recording" })).toBe("🎤 recording…");
    expect(barText({ ...base, phase: "transcribing" })).toBe("transcribing…");
    expect(barText({ ...base, phase: "review" })).toBe("tap = send · swipe↓ = redo");
  });
  it("idle reflects the turn state", () => {
    expect(barText({ ...base, phase: "idle", turn: "idle" })).toBe("ready for input");
    expect(barText({ ...base, phase: "idle", turn: "thinking" })).toBe("thinking…");
  });
  it("working names the active tool", () => {
    const s = { ...base, phase: "idle" as const, turn: "working" as const,
      stream: [{ kind: "tool" as const, name: "terminal", running: true }] };
    expect(barText(s)).toBe("working… (terminal)");
  });
});

describe("connDot", () => {
  it("filled when connected, hollow otherwise", () => {
    expect(connDot("connected")).toBe("●");
    expect(connDot("reconnecting")).toBe("◌");
  });
});
