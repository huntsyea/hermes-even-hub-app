import { waitForEvenAppBridge } from "@evenrealities/even_hub_sdk";
import { loadConfig } from "./config";
import { BridgeClient } from "./net/ws-client";
import { initialState, reduce, selectSessionId, setView, type AppState } from "./state/store";
import { buildChatPage, buildSessionsPage, showChatPage } from "./ui/render";
import { renderChat, renderSessions } from "./ui/views";
import { routeEvent } from "./input/router";
import { textMsg, sessionsList, sessionsSwitch, sessionsNew, stopMsg } from "./protocol";
import { serializeLatest } from "./util/coalesce";
import { createCapture } from "./audio/capture";
import { saveConnectionState, loadConnectionState } from "./storage/persist";

async function boot(): Promise<void> {
  const bridge = await waitForEvenAppBridge();
  await buildChatPage(bridge);
  let state: AppState = initialState();
  const cfg = loadConfig();

  // Restore last-good URL from SDK localStorage so Tailscale/LAN preference is preserved.
  const persisted = await loadConnectionState(bridge);
  const urls = persisted.url
    ? [persisted.url, cfg.lanUrl, cfg.remoteUrl].filter(Boolean)
    : [cfg.lanUrl, cfg.remoteUrl];

  const scheduleRender = serializeLatest((s: AppState) =>
    s.view === "sessions" ? renderSessions(bridge, s) : renderChat(bridge, s));

  let currentUrl = urls[0] ?? "";
  const client = new BridgeClient(
    { urls, token: cfg.token },
    {
      onMessage: (m) => {
        state = reduce(state, m);
        scheduleRender(state);
        // Persist connection state when we know the active session.
        if (m.t === "hello.ok" || m.t === "active") {
          const sessionId = m.t === "hello.ok" ? (m.active ?? "") : m.id;
          void saveConnectionState(bridge, currentUrl, sessionId);
        }
      },
      onStatus: (s, url?: string) => {
        if (url) currentUrl = url;
        state = { ...state, conn: s };
        scheduleRender(state);
      },
    },
  );
  client.connect();
  const capture = createCapture(bridge, client);
  let torn = false;
  function teardown(): void {
    if (torn) return;
    torn = true;
    off();
    void capture.stop();  // stop mic if recording
    client.close();
  }

  const off = bridge.onEvenHubEvent((e) => {
    capture.handleEvent(e);
    routeEvent(e, {
      onClick: (index) => {
        if (state.view === "chat") {
          // Chat: send the M1 test turn.
          client.send(textMsg("What time is it?"));
        } else {
          // Sessions: switch to the highlighted session, then return to chat.
          const id = selectSessionId(state, index ?? -1);
          if (id) {
            client.send(sessionsSwitch(id));
            state = setView(state, "chat");
            void showChatPage(bridge);
          }
        }
      },
      onDoubleClick: () => {
        if (state.view === "chat") {
          // Chat: toggle the mic.
          const nowRecording = !state.recording;
          state = { ...state, recording: nowRecording };
          scheduleRender(state);
          if (nowRecording) {
            void capture.start();
          } else {
            void capture.stop();
          }
        } else {
          // Sessions: start a new session, then return to chat.
          client.send(sessionsNew());
          state = setView(state, "chat");
          void showChatPage(bridge);
        }
      },
      onScrollUp: () => {
        if (state.view === "chat") {
          // Chat: open the sessions view (request the list + build the page).
          state = setView(state, "sessions");
          client.send(sessionsList());
          void buildSessionsPage(bridge, state.sessions.items.map((i) => i.title));
        }
        // Sessions: scroll is handled natively by firmware
      },
      onScrollDown: () => {
        if (state.view === "chat") {
          // Send stop to interrupt the active assistant turn.
          // Note: the bridge currently treats this as a no-op (SSE stream can't be cancelled mid-flight).
          // The turn will finish naturally; this is a v1 placeholder for future cancellation support.
          client.send(stopMsg());
        }
      },
      onForegroundExit: () => teardown(),
    });
  });

  window.addEventListener("beforeunload", teardown);

  console.log("[glasses] ready");
}

boot().catch((err) => console.error("[glasses] boot failed", err));
