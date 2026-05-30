import { waitForEvenAppBridge, OsEventTypeList } from "@evenrealities/even_hub_sdk";
import { loadConfig } from "./config";
import { BridgeClient } from "./net/ws-client";
import { initialState, reduce, type AppState } from "./state/store";
import { createListStartup, showListPage, showSessionPage } from "./ui/render";
import { renderList, renderSession, listRows } from "./ui/views";
import { routeEvent } from "./input/router";
import { dispatch, type Gesture, type Effect } from "./input/dispatch";
import { sessionsList } from "./protocol";
import { serializeLatest } from "./util/coalesce";
import { createCapture } from "./audio/capture";
import { saveConnectionState, loadConnectionState } from "./storage/persist";

async function boot(): Promise<void> {
  const bridge = await waitForEvenAppBridge();
  let state: AppState = initialState();
  await createListStartup(bridge, listRows(state)); // one-shot startup = the list

  const cfg = loadConfig();
  const persisted = await loadConnectionState(bridge);
  const urls = persisted.url
    ? [persisted.url, cfg.lanUrl, cfg.remoteUrl].filter(Boolean)
    : [cfg.lanUrl, cfg.remoteUrl];

  const scheduleRender = serializeLatest((s: AppState) =>
    s.screen === "list" ? renderList(bridge, s) : renderSession(bridge, s));

  let currentUrl = urls[0] ?? "";
  const client = new BridgeClient(
    { urls, token: cfg.token },
    {
      onMessage: (m) => {
        state = reduce(state, m);
        scheduleRender(state);
        if (m.t === "hello.ok") {
          client.send(sessionsList()); // populate the list once connected
          void saveConnectionState(bridge, currentUrl, m.active ?? "");
        }
        if (m.t === "active") void saveConnectionState(bridge, currentUrl, m.id);
      },
      onStatus: (s) => { state = { ...state, conn: s }; scheduleRender(state); },
    },
  );
  client.connect();

  const capture = createCapture(bridge, client);

  function runEffect(e: Effect): void {
    if (e.kind === "send") client.send(e.frame);
    else if (e.kind === "startMic") void capture.start();
    else if (e.kind === "stopMic") void capture.stop();
    else if (e.kind === "exit") bridge.shutDownPageContainer(1);
  }

  async function applyGesture(g: Gesture, index?: number): Promise<void> {
    const prevScreen = state.screen;
    const r = dispatch(state, g, index);
    state = r.state;
    for (const e of r.effects) runEffect(e);
    if (state.screen !== prevScreen) {
      // Page kind changed — rebuild before filling content.
      if (state.screen === "list") await showListPage(bridge, listRows(state));
      else await showSessionPage(bridge);
    }
    scheduleRender(state);
  }

  // Full teardown only on real exit (system/abnormal), per handle-input skill.
  let torn = false;
  function teardown(): void {
    if (torn) return;
    torn = true;
    off();
    void capture.stop();
    client.close();
  }

  const off = bridge.onEvenHubEvent((e) => {
    capture.handleEvent(e);
    const et = e.sysEvent?.eventType ?? e.listEvent?.eventType ?? e.textEvent?.eventType;
    // Lifecycle: background = flush only; system/abnormal exit = teardown.
    if (et === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
      void saveConnectionState(bridge, currentUrl, state.sessions.active ?? "");
      return;
    }
    if (et === OsEventTypeList.SYSTEM_EXIT_EVENT || et === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
      teardown();
      return;
    }
    routeEvent(e, {
      onClick: (index) => { void applyGesture("click", index); },
      onDoubleClick: () => { void applyGesture("doubleClick"); },
      onScrollUp: () => { void applyGesture("scrollUp"); },
      onScrollDown: () => { void applyGesture("scrollDown"); },
    });
  });

  window.addEventListener("beforeunload", teardown);
  console.log("[glasses] ready");
}

boot().catch((err) => console.error("[glasses] boot failed", err));
