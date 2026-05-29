import { waitForEvenAppBridge } from "@evenrealities/even_hub_sdk";
import { loadConfig } from "./config";
import { BridgeClient } from "./net/ws-client";
import { initialState, reduce, type AppState } from "./state/store";
import { buildChatPage } from "./ui/render";
import { renderChat } from "./ui/views";
import { routeEvent } from "./input/router";
import { textMsg } from "./protocol";

async function boot(): Promise<void> {
  const bridge = await waitForEvenAppBridge();
  await buildChatPage(bridge);
  let state: AppState = initialState();
  const cfg = loadConfig();
  const client = new BridgeClient(
    { urls: [cfg.lanUrl, cfg.remoteUrl], token: cfg.token },
    {
      onMessage: (m) => { state = reduce(state, m); void renderChat(bridge, state); },
      onStatus: (s) => { state = { ...state, conn: s }; void renderChat(bridge, state); },
    },
  );
  client.connect();
  bridge.onEvenHubEvent((e) => routeEvent(e, {
    onClick: () => client.send(textMsg("What time is it?")),
    onDoubleClick: () => bridge.shutDownPageContainer(1),
    onScrollUp: () => {},
    onScrollDown: () => {},
  }));
}

boot().catch((err) => console.error("[glasses] boot failed", err));
