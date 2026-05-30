import { describe, it, expect, vi } from "vitest";
import { setText, IDS, createListStartup, showListPage, showSessionPage } from "../src/ui/render";

function fakeBridge() {
  return {
    createStartUpPageContainer: vi.fn(async () => {}),
    rebuildPageContainer: vi.fn(async () => {}),
    textContainerUpgrade: vi.fn(async () => {}),
  } as any;
}

describe("setText", () => {
  it("full-replaces with the container name", async () => {
    const b = fakeBridge();
    await setText(b, IDS.status, "x");
    const arg = b.textContainerUpgrade.mock.calls[0][0];
    expect(arg.containerName).toBe("status");
    expect(arg.contentOffset).toBe(0);
    expect(arg.contentLength).toBe(0);
    expect(arg.content).toBe("x");
  });
});

describe("list pages", () => {
  it("createListStartup builds a one-shot list page with the given rows", async () => {
    const b = fakeBridge();
    await createListStartup(b, ["＋ New session", "A"]);
    const arg = b.createStartUpPageContainer.mock.calls[0][0];
    expect(arg.listObject[0].itemContainer.itemName).toEqual(["＋ New session", "A"]);
  });
  it("showListPage rebuilds the list page with the rows", async () => {
    const b = fakeBridge();
    await showListPage(b, ["＋ New session"]);
    const arg = b.rebuildPageContainer.mock.calls[0][0];
    expect(arg.listObject[0].itemContainer.itemName).toEqual(["＋ New session"]);
  });
});

describe("session page", () => {
  it("showSessionPage rebuilds three text containers", async () => {
    const b = fakeBridge();
    await showSessionPage(b);
    const arg = b.rebuildPageContainer.mock.calls[0][0];
    expect(arg.containerTotalNum).toBe(3);
    expect(arg.textObject).toHaveLength(3);
  });
});
