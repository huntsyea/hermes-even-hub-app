import { describe, it, expect } from "vitest";
import { streamToText } from "../src/ui/stream";
import type { StreamItem } from "../src/state/store";

describe("streamToText", () => {
  it("prefixes: > user, / tool (running vs done), plain assistant", () => {
    const items: StreamItem[] = [
      { kind: "user", text: "add dark mode" },
      { kind: "tool", name: "terminal", running: false, ok: true },
      { kind: "assistant", text: "Added it." },
      { kind: "tool", name: "grep", running: true },
    ];
    expect(streamToText(items)).toBe("> add dark mode\n/ terminal ✓\nAdded it.\n/ grep");
  });
  it("marks a failed tool with ✗", () => {
    expect(streamToText([{ kind: "tool", name: "x", running: false, ok: false }])).toBe("/ x ✗");
  });
  it("returns empty string for an empty stream", () => {
    expect(streamToText([])).toBe("");
  });
  it("keeps the tail when over maxChars", () => {
    const items: StreamItem[] = [{ kind: "assistant", text: "abcdefghij" }];
    expect(streamToText(items, 5)).toBe("…ghij");
  });
});
