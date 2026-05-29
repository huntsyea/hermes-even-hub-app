import {
  CreateStartUpPageContainer, TextContainerProperty, TextContainerUpgrade,
} from "@evenrealities/even_hub_sdk";
import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";

export const IDS = { header: 1, body: 2, status: 3 } as const;

export async function buildChatPage(bridge: EvenAppBridge): Promise<void> {
  await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
    containerTotalNum: 3,
    textObject: [
      new TextContainerProperty({ containerID: IDS.header, containerName: "header", xPosition: 0, yPosition: 0,   width: 576, height: 40,  paddingLength: 4, content: "Hermes" }),
      new TextContainerProperty({ containerID: IDS.body,   containerName: "body",   xPosition: 0, yPosition: 44,  width: 576, height: 200, paddingLength: 4, content: "", isEventCapture: 1 }),
      new TextContainerProperty({ containerID: IDS.status, containerName: "status", xPosition: 0, yPosition: 248, width: 576, height: 36,  paddingLength: 4, content: "connecting…" }),
    ],
  }));
}

export async function setText(bridge: EvenAppBridge, id: number, content: string): Promise<void> {
  await bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: id, content }));
}
