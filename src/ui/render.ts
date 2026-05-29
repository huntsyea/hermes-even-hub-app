import {
  CreateStartUpPageContainer, RebuildPageContainer,
  ListContainerProperty, ListItemContainerProperty,
  TextContainerProperty, TextContainerUpgrade,
} from "@evenrealities/even_hub_sdk";
import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";

export const IDS = { header: 1, body: 2, status: 3, list: 4 } as const;
export const NAMES: Record<number, string> = {
  [IDS.header]: "header", [IDS.body]: "body", [IDS.status]: "status", [IDS.list]: "list",
};

// The 3 chat text containers, shared by createStartUpPageContainer (initial)
// and rebuildPageContainer (re-entry from the sessions page).
function chatTextObjects(): TextContainerProperty[] {
  return [
    new TextContainerProperty({ containerID: IDS.header, containerName: "header", xPosition: 0, yPosition: 0,   width: 576, height: 40,  paddingLength: 4, content: "Hermes" }),
    new TextContainerProperty({ containerID: IDS.body,   containerName: "body",   xPosition: 0, yPosition: 44,  width: 576, height: 200, paddingLength: 4, content: "", isEventCapture: 1 }),
    new TextContainerProperty({ containerID: IDS.status, containerName: "status", xPosition: 0, yPosition: 248, width: 576, height: 36,  paddingLength: 4, content: "connecting…" }),
  ];
}

export async function buildChatPage(bridge: EvenAppBridge): Promise<void> {
  await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
    containerTotalNum: 3,
    textObject: chatTextObjects(),
  }));
}

// Re-enter the chat page after the sessions list. createStartUpPageContainer
// is one-shot (SDK rule), so switching pages uses rebuildPageContainer with the
// same 3 text containers. renderChat() then refills body/status in-place.
export async function showChatPage(bridge: EvenAppBridge): Promise<void> {
  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 3,
    textObject: chatTextObjects(),
  }));
}

// Build the sessions page: a single full-canvas scrollable list. The list
// container captures input (single-press => List_ItemEvent w/ index, double-press
// => Sys_ItemEvent). Firmware scrolls the highlight natively; no scroll handler.
// itemCount is clamped to the firmware list max (20).
export async function buildSessionsPage(bridge: EvenAppBridge, titles: string[]): Promise<void> {
  const items = titles.slice(0, 20);
  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 1,
    listObject: [
      new ListContainerProperty({
        containerID: IDS.list, containerName: "list",
        xPosition: 0, yPosition: 0, width: 576, height: 288,
        isEventCapture: 1,
        itemContainer: new ListItemContainerProperty({
          itemCount: Math.max(1, items.length),
          itemWidth: 0,              // 0 = auto, fills container width
          isItemSelectBorderEn: 1,   // show selection border on the highlighted row
          itemName: items.length ? items : ["No sessions"],
        }),
      }),
    ],
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
