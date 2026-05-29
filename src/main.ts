import { waitForEvenAppBridge } from "@evenrealities/even_hub_sdk";
import { loadConfig } from "./config";
import { BridgeClient } from "./net/ws-client";
import { initialState, reduce, type AppState } from "./state/store";
import { buildChatPage } from "./ui/render";
import { renderChat } from "./ui/views";
import { routeEvent } from "./input/router";
import { textMsg } from "./protocol";
import { serializeLatest } from "./util/coalesce";

async function boot(): Promise<void> {
  const bridge = await waitForEvenAppBridge();
  await buildChatPage(bridge);
  let state: AppState = initialState();
  const cfg = loadConfig();
  const scheduleRender = serializeLatest((s: AppState) => renderChat(bridge, s));
  const client = new BridgeClient(
    { urls: [cfg.lanUrl, cfg.remoteUrl], token: cfg.token },
    {
      onMessage: (m) => { state = reduce(state, m); scheduleRender(state); },
      onStatus: (s) => { state = { ...state, conn: s }; scheduleRender(state); },
    },
  );
  client.connect();
  let torn = false;
  function teardown(): void {
    if (torn) return;
    torn = true;
    off();
    client.close();
    // M4: bridge.audioControl(false) once the mic is wired (see device-features)
  }

  const off = bridge.onEvenHubEvent((e) => routeEvent(e, {
    onClick: () => client.send(textMsg("What time is it?")),
    onDoubleClick: () => bridge.shutDownPageContainer(1),
    onScrollUp: () => {},
    onScrollDown: () => {},
    onForegroundExit: () => teardown(),
  }));

  window.addEventListener("beforeunload", teardown);

  console.log("[glasses] ready");
}

boot().catch((err) => console.error("[glasses] boot failed", err));
