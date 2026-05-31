import { describe, it, expect } from "vitest";
import { getTextWidth } from "@evenrealities/pretext";
import {
  THREAD_BODY_INNER_WIDTH,
  THREAD_VIEWPORT_LINES,
  currentThreadViewport,
  nextThreadViewportCursor,
  previousThreadViewportIndex,
  streamToText,
  threadPages,
  threadViewports,
  wrapTextLines,
} from "../src/ui/stream";
import type { StreamItem } from "../src/state/store";

const RULE = "─".repeat(26);

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

describe("measured wrapping", () => {
  it("wraps long text to the measured body width", () => {
    const lines = wrapTextLines("x".repeat(140));
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(getTextWidth(line)).toBeLessThanOrEqual(THREAD_BODY_INNER_WIDTH);
  });

  it("preserves explicit line breaks", () => {
    expect(wrapTextLines("a\nb\nc")).toEqual(["a", "b", "c"]);
  });
});

describe("threadPages", () => {
  it("renders then returns measured viewports", () => {
    const items: StreamItem[] = [{ kind: "user", text: "hi" }];
    expect(threadPages(items)).toEqual(["> hi"]);
  });

  it("creates overlapping viewport windows by measured line capacity", () => {
    const lines = Array.from({ length: THREAD_VIEWPORT_LINES + 1 }, (_, i) => `line ${i + 1}`);
    const items: StreamItem[] = [{ kind: "assistant", text: lines.join("\n") }];
    const viewports = threadViewports(items);

    expect(viewports).toHaveLength(2);
    expect(viewports[0].content).toBe(lines.slice(0, THREAD_VIEWPORT_LINES).join("\n"));
    expect(viewports[1].content).toBe(lines.slice(1).join("\n"));
  });

  it("uses null as follow-latest mode", () => {
    const lines = Array.from({ length: THREAD_VIEWPORT_LINES + 1 }, (_, i) => `line ${i + 1}`);
    const items: StreamItem[] = [{ kind: "assistant", text: lines.join("\n") }];

    expect(currentThreadViewport(items, null).index).toBe(1);
    expect(previousThreadViewportIndex(items, null)).toBe(0);
    expect(nextThreadViewportCursor(items, 0)).toBeNull();
  });
});

// body container: width 576, paddingLength 4 → 568px usable (see ui/render.ts)
const BODY_INNER_PX = 576 - 2 * 4;

describe("banner divider", () => {
  it("every banner line fits one display line", () => {
    const out = streamToText([{ kind: "banner", text: "model: claude\ncwd: /home/u" }]);
    for (const line of out.split("\n")) {
      expect(getTextWidth(line)).toBeLessThanOrEqual(BODY_INNER_PX);
    }
  });
});
