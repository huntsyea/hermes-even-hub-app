import { describe, expect, it } from "vitest";
import { sessionListRows } from "../src/ui/session-list";

const utf8 = new TextEncoder();

describe("sessionListRows", () => {
  it("keeps same-age untitled sessions visually distinct", () => {
    const rows = sessionListRows([
      { id: "20260603_214928_c173a316", title: "New session", updated: 1_780_000_000 },
      { id: "20260603_214450_6b8e5adb", title: "New session", updated: 1_780_000_000 },
    ], null, 1_780_000_000);

    expect(rows.slice(1)).toEqual([
      "  now New session a316",
      "  now New session 5adb",
    ]);
    expect(new Set(rows).size).toBe(rows.length);
  });

  it("keeps every rendered row within the firmware byte limit", () => {
    const rows = sessionListRows([
      {
        id: "long",
        title: "A very long session title with multibyte symbols ●＋ and enough text to overflow the list item byte validator",
        updated: 1_780_000_000,
      },
    ], "long", 1_780_000_030);

    expect(rows.every((row) => utf8.encode(row).length <= 63)).toBe(true);
  });
});
