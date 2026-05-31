import { describe, it, expect, vi } from "vitest";
import { setText, IDS, createListStartup, createSetupStartup, showListPage, showSessionPage } from "../src/ui/render";

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
    expect(arg.containerTotalNum).toBe(1);
    expect(arg.listObject).toHaveLength(1);
    expect(arg.listObject[0].itemContainer.itemName).toEqual(["＋ New session", "A"]);
  });
  it("showListPage rebuilds the list page with the rows", async () => {
    const b = fakeBridge();
    await showListPage(b, ["＋ New session"]);
    const arg = b.rebuildPageContainer.mock.calls[0][0];
    expect(arg.containerTotalNum).toBe(1);
    expect(arg.listObject).toHaveLength(1);
    expect(arg.listObject[0].itemContainer.itemName).toEqual(["＋ New session"]);
  });
});

describe("setup page", () => {
  it("createSetupStartup builds a one-shot phone handoff message", async () => {
    const b = fakeBridge();
    await createSetupStartup(b);
    const arg = b.createStartUpPageContainer.mock.calls[0][0];
    expect(arg.containerTotalNum).toBe(1);
    expect(arg.textObject[0].content).toBe("Open phone app\nto configure bridge.");
  });
});

describe("session page", () => {
  it("showSessionPage rebuilds four text containers (header, dot, body, status)", async () => {
    const b = fakeBridge();
    await showSessionPage(b);
    const arg = b.rebuildPageContainer.mock.calls[0][0];
    expect(arg.containerTotalNum).toBe(4);
    expect(arg.textObject).toHaveLength(4);
  });
});
