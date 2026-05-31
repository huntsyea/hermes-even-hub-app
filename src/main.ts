import { waitForEvenAppBridge, OsEventTypeList } from "@evenrealities/even_hub_sdk";
import "./style.css";
import { loadBridgeDefaults } from "./config";
import { BridgeClient } from "./net/ws-client";
import { initialState, reduce, type AppState } from "./state/store";
import { createLoadingStartup, createSetupStartup, showListPage, showLoadingPage, showSessionPage } from "./ui/render";
import { loadingText, renderSession, listRows } from "./ui/views";
import { renderPhoneSetup } from "./ui/phone";
import { routeEvent, type ListSelection } from "./input/router";
import { dispatch, type Gesture, type Effect } from "./input/dispatch";
import { sessionsList } from "./protocol";
import { serializeLatest } from "./util/coalesce";
import { createCapture } from "./audio/capture";
import {
  loadConnectionProfile,
  saveConnectionProfile,
  updateActiveSession,
  validateConnectionProfile,
  type ConnectionProfile,
} from "./storage/persist";

const fireAndForget = (p: Promise<unknown>): void => { void p.catch(() => {}); };

async function boot(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("Missing #app root");

  const bridge = await waitForEvenAppBridge();
  const defaults = loadBridgeDefaults();
  let profile = await loadConnectionProfile(bridge);
  let state: AppState = initialState();
  let phoneErrors: string[] = [];
  let glassesView: "setup" | "list" = profileIsReady(profile) ? "list" : "setup";
  let visibleListRows = listRows(state);
  let helloOk = false;
  let sessionsRetryTimer: ReturnType<typeof setInterval> | undefined;

  if (glassesView === "list") {
    await createLoadingStartup(bridge);
  } else {
    state = { ...state, conn: "not configured" };
    await createSetupStartup(bridge);
  }

  const scheduleRender = serializeLatest((s: AppState) => {
    if (glassesView === "setup") return Promise.resolve();
    if (s.screen === "list") {
      if (!s.sessionsLoaded) return showLoadingPage(bridge, loadingText(s));
      visibleListRows = listRows(s);
      return showListPage(bridge, visibleListRows);
    }
    return renderSession(bridge, s);
  });

  const renderPhone = (): void => {
    renderPhoneSetup(root, {
      profile,
      defaults,
      status: state.conn,
      errors: phoneErrors,
    }, {
      onSaveConnect: (url, token) => {
        fireAndForget(saveAndConnect(url, token));
      },
      onDisconnect: () => {
        client.disconnect();
      },
    });
  };

  const setStatus = (conn: string): void => {
    state = { ...state, conn };
    scheduleRender(state);
    renderPhone();
  };

  const persistActiveSession = (activeSession: string | null): void => {
    if (!profile) return;
    fireAndForget(updateActiveSession(bridge, profile, activeSession).then((next) => {
      profile = next;
      renderPhone();
    }));
  };

  const startSessionsRetry = (): void => {
    if (sessionsRetryTimer) return;
    sessionsRetryTimer = setInterval(() => {
      if (helloOk && !state.sessionsLoaded) client.send(sessionsList());
    }, 2000);
  };

  const stopSessionsRetry = (): void => {
    clearInterval(sessionsRetryTimer);
    sessionsRetryTimer = undefined;
  };

  const client = new BridgeClient({
    onMessage: (m) => {
      state = reduce(state, m);
      scheduleRender(state);
      if (m.t === "hello.ok") {
        helloOk = true;
        client.send(sessionsList());
        startSessionsRetry();
        persistActiveSession(m.active);
      }
      if (m.t === "sessions") stopSessionsRetry();
      if (m.t === "active") persistActiveSession(m.id);
    },
    onStatus: setStatus,
  });

  async function saveAndConnect(url: string, token: string): Promise<void> {
    const candidate: ConnectionProfile = {
      url,
      token,
      activeSession: profile?.activeSession,
      updatedAt: Date.now(),
    };
    const validation = validateConnectionProfile(candidate);
    if (!validation.valid) {
      phoneErrors = validation.errors;
      setStatus("not configured");
      return;
    }

    phoneErrors = [];
    profile = await saveConnectionProfile(bridge, candidate);
    if (glassesView === "setup") {
      glassesView = "list";
      await showLoadingPage(bridge, loadingText(state));
    }
    helloOk = false;
    client.connect(profile);
    renderPhone();
  }

  renderPhone();
  if (profileIsReady(profile)) {
    helloOk = false;
    client.connect(profile);
  }

  const capture = createCapture(bridge, client);

  function runEffect(e: Effect): void {
    if (e.kind === "send") client.send(e.frame);
    else if (e.kind === "startMic") void capture.start();
    else if (e.kind === "stopMic") void capture.stop();
    else if (e.kind === "exit") bridge.shutDownPageContainer(1);
  }

  function selectedListIndex(selection?: ListSelection): number | undefined {
    if (selection?.index !== undefined) return selection.index;
    if (selection?.name !== undefined) {
      const index = visibleListRows.indexOf(selection.name);
      return index >= 0 ? index : -1;
    }
    return undefined;
  }

  async function applyGesture(g: Gesture, index?: number): Promise<void> {
    if (glassesView === "setup") {
      if (g === "doubleClick") bridge.shutDownPageContainer(1);
      return;
    }

    const prevScreen = state.screen;
    const r = dispatch(state, g, index);
    state = r.state;
    for (const e of r.effects) runEffect(e);
    if (state.screen !== prevScreen) {
      if (state.screen === "list") {
        visibleListRows = listRows(state);
        await showListPage(bridge, visibleListRows);
      }
      else await showSessionPage(bridge);
    }
    scheduleRender(state);
  }

  let torn = false;
  function teardown(): void {
    if (torn) return;
    torn = true;
    off();
    void capture.stop();
    stopSessionsRetry();
    client.disconnect();
  }

  const off = bridge.onEvenHubEvent((e) => {
    capture.handleEvent(e);
    const et = e.sysEvent?.eventType ?? e.listEvent?.eventType ?? e.textEvent?.eventType;
    if (et === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
      if (profile) fireAndForget(updateActiveSession(bridge, profile, state.sessions.active ?? ""));
      return;
    }
    if (et === OsEventTypeList.SYSTEM_EXIT_EVENT || et === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
      teardown();
      return;
    }
    routeEvent(e, {
      onClick: (selection) => { fireAndForget(applyGesture("click", selectedListIndex(selection))); },
      onDoubleClick: () => { fireAndForget(applyGesture("doubleClick")); },
      onScrollUp: () => { fireAndForget(applyGesture("scrollUp")); },
      onScrollDown: () => { fireAndForget(applyGesture("scrollDown")); },
    });
  });

  window.addEventListener("beforeunload", teardown);
  console.log("[glasses] ready");
}

function profileIsReady(profile: ConnectionProfile | null): profile is ConnectionProfile {
  return !!profile && validateConnectionProfile(profile).valid;
}

boot().catch((err) => console.error("[glasses] boot failed", err));
