import {
  CreateStartUpPageContainer, RebuildPageContainer,
  ListContainerProperty, ListItemContainerProperty,
  TextContainerProperty, TextContainerUpgrade,
} from "@evenrealities/even_hub_sdk";
import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";

export const IDS = { header: 1, body: 2, status: 3, list: 4, dot: 5 } as const;
export const NAMES: Record<number, string> = {
  [IDS.header]: "header", [IDS.body]: "body", [IDS.status]: "status",
  [IDS.list]: "list", [IDS.dot]: "dot",
};

// The 3 chat text containers, shared by showSessionPage (rebuildPageContainer).
// createStartUpPageContainer is one-shot, so the startup page is the list;
// re-entering a session uses rebuildPageContainer with these 3 text containers.
function chatTextObjects(): TextContainerProperty[] {
  return [
    new TextContainerProperty({ containerID: IDS.header, containerName: "header", xPosition: 0,   yPosition: 0,   width: 540, height: 40,  paddingLength: 4, content: "Hermes" }),
    new TextContainerProperty({ containerID: IDS.dot,    containerName: "dot",    xPosition: 540, yPosition: 0,   width: 36,  height: 40,  paddingLength: 4, content: "◌" }),
    new TextContainerProperty({ containerID: IDS.body,   containerName: "body",   xPosition: 0,   yPosition: 44,  width: 576, height: 200, paddingLength: 4, content: "", isEventCapture: 1 }),
    new TextContainerProperty({ containerID: IDS.status, containerName: "status", xPosition: 0,   yPosition: 248, width: 576, height: 36,  paddingLength: 4, content: "connecting…" }),
  ];
}

// Session page: the three text containers (header / body / status), reused for
// every session render. createStartUpPageContainer is one-shot, so re-entering a
// session uses rebuildPageContainer; renderSession() then fills content in-place.
export async function showSessionPage(bridge: EvenAppBridge): Promise<void> {
  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 4,
    textObject: chatTextObjects(),
  }));
}

function listContainer(rows: string[]): ListContainerProperty[] {
  const items = rows.slice(0, 20);
  return [
    new ListContainerProperty({
      containerID: IDS.list, containerName: "list",
      xPosition: 0, yPosition: 0, width: 576, height: 288,
      isEventCapture: 1,
      itemContainer: new ListItemContainerProperty({
        itemCount: Math.max(1, items.length),
        itemWidth: 0,
        isItemSelectBorderEn: 1,
        itemName: items.length ? items : ["No sessions"],
      }),
    }),
  ];
}

// Boot lands on the list, so the one-shot startup page IS the list.
export async function createListStartup(bridge: EvenAppBridge, rows: string[]): Promise<void> {
  await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
    containerTotalNum: 1,
    listObject: listContainer(rows),
  }));
}

export async function showListPage(bridge: EvenAppBridge, rows: string[]): Promise<void> {
  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 1,
    listObject: listContainer(rows),
  }));
}

export async function setText(bridge: EvenAppBridge, id: number, content: string): Promise<void> {
  await bridge.textContainerUpgrade(new TextContainerUpgrade({
    containerID: id,
    containerName: NAMES[id],
    contentOffset: 0,
    contentLength: 0,   // full replacement (glasses-ui requirement)
    content,
  }));
}
