import { describe, it, expect } from "vitest";
import { streamToText, paginate, threadPages } from "../src/ui/stream";
import type { StreamItem } from "../src/state/store";

const RULE = "─".repeat(40);

describe("streamToText", () => {
  it("> user, ▸ tool (running/done/failed), plain assistant", () => {
    const items: StreamItem[] = [
      { kind: "user", text: "add dark mode" },
      { kind: "tool", name: "terminal", running: false, ok: true },
      { kind: "assistant", text: "Added it." },
      { kind: "tool", name: "grep", running: true },
    ];
    expect(streamToText(items)).toBe(
      "> add dark mode\n\n▸ terminal ✓\n\nAdded it.\n\n▸ grep",
    );
  });
  it("marks a failed tool with ✗", () => {
    expect(streamToText([{ kind: "tool", name: "x", running: false, ok: false }])).toBe("▸ x ✗");
  });
  it("keeps consecutive tool calls tight (single newline)", () => {
    const items: StreamItem[] = [
      { kind: "tool", name: "a", running: false, ok: true },
      { kind: "tool", name: "b", running: false, ok: true },
    ];
    expect(streamToText(items)).toBe("▸ a ✓\n▸ b ✓");
  });
  it("fences a banner with horizontal rules", () => {
    const items: StreamItem[] = [{ kind: "banner", text: "model: claude-opus\ncwd: ~/dev" }];
    expect(streamToText(items)).toBe(`${RULE}\n model: claude-opus\n cwd: ~/dev\n${RULE}`);
  });
  it("separates a banner from following text with a blank line", () => {
    const items: StreamItem[] = [
      { kind: "banner", text: "model: x" },
      { kind: "user", text: "hi" },
    ];
    expect(streamToText(items)).toBe(`${RULE}\n model: x\n${RULE}\n\n> hi`);
  });
  it("returns empty string for an empty stream", () => {
    expect(streamToText([])).toBe("");
  });
});

describe("paginate", () => {
  it("returns one empty page for empty text", () => {
    expect(paginate("")).toEqual([""]);
  });
  it("splits on line boundaries within the char budget", () => {
    const text = "0123456789\n0123456789\n0123456789";
    const pages = paginate(text, 25);
    expect(pages).toEqual(["0123456789\n0123456789", "0123456789"]);
  });
  it("hard-splits a single line longer than the budget", () => {
    expect(paginate("abcdef", 3)).toEqual(["abc", "def"]);
  });
  it("drops blank-line separators that straddle a page boundary", () => {
    expect(paginate("a".repeat(360) + "\n\n" + "x", 360)).toEqual(["a".repeat(360), "x"]);
  });
});

describe("threadPages", () => {
  it("renders then paginates the stream", () => {
    const items: StreamItem[] = [{ kind: "user", text: "hi" }];
    expect(threadPages(items)).toEqual(["> hi"]);
  });
});
