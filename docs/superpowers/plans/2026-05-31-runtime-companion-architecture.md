# Runtime Companion Architecture Plan

## Summary

Build the next `hermes-even-hub-app` evolution around an OcuClaw-style local ownership model:
the Even Hub Vite app becomes a runtime-configured companion that accepts a user-entered
`wss://` bridge URL and token, persists them with the Even SDK storage API, and keeps the
current glasses terminal UI as the primary hands-free interaction surface.

Default production path is Tailscale Serve WSS:

```text
Even Hub app runtime settings
  -> wss://<node>.<tailnet>.ts.net:<port>
  -> Tailscale Serve
  -> local hermes-evenhub-bridge WebSocket
  -> Hermes agent
```

A hosted relay remains a fallback only if Even review/runtime rejects the wildcard Tailscale
network pattern.

## Key Changes

- Add a phone-side setup/status surface inside the existing Vite app:
  - Show URL, token, connection state, connect/disconnect, and setup help.
  - Store secrets at runtime instead of requiring `VITE_BRIDGE_TOKEN`.
  - Show a simple glasses message when setup is missing: "Open phone app to configure bridge."

- Replace build-time connection config with runtime profile storage:
  - Add `ConnectionProfile`:
    ```ts
    interface ConnectionProfile {
      url: string;
      token: string;
      activeSession?: string;
      updatedAt: number;
    }
    ```
  - Store JSON under `hermes.connectionProfile.v1` using `bridge.setLocalStorage`.
  - Read old `hermes.lastUrl` / `hermes.activeSession` keys as migration fallback.
  - Keep Vite env values only as optional developer defaults, never required for open-source builds.

- Update `BridgeClient` to support runtime connect/reconnect:
  - Construct with callbacks only.
  - `connect(profile: ConnectionProfile)` opens `profile.url` and sends existing
    `hello { token, device: "g2" }`.
  - `disconnect()` cleanly stops watchdog/reconnect timers.
  - On successful `hello.ok` and `active`, persist `activeSession`.

- Update `app.json` for open-source production:
  - Remove committed private IP/Tailnet host entries.
  - Use Tailscale-oriented whitelist entries: `https://*.ts.net` and `wss://*.ts.net`.
  - Keep `g2-microphone`.
  - Document that exact-host local sideloads can edit `app.json` if wildcard review behavior changes.

- Update docs:
  - README setup no longer asks users to edit `.env.local` for secrets.
  - Add Tailscale Serve example:
    ```bash
    tailscale serve --https=8443 --bg http://localhost:8765
    ```
  - Document runtime entry of `wss://<node>.<tailnet>.ts.net:8443` plus bridge token.
  - Update `SECURITY.md`: token is now stored in Even SDK local storage on the user's phone
    instead of bundled into the app.

## Tests And Validation

- Unit tests:
  - Connection profile save/load/migration.
  - URL/token validation accepts `wss://...` and dev `ws://...`.
  - `BridgeClient.connect(profile)` sends the current `hello` frame.
  - Disconnect stops watchdog/reconnect.
  - Missing profile does not attempt WebSocket connection.

- Build/package checks:
  - `npm run test`
  - `npm run build`
  - `npm run pack`

- Device validation:
  - Install app with no build-time bridge env.
  - Enter Tailscale Serve `wss://...ts.net:8443` and token in the phone companion UI.
  - Confirm `hello.ok`, session list load, voice capture, transcript review, assistant streaming,
    and reconnect after app restart.
  - Confirm no private URL/token appears in committed source, built docs, or default `app.json`.

## Assumptions

- First implementation is "phone setup + glasses terminal," not a full OcuClaw-style phone
  control dashboard.
- Tailscale Serve WSS is the v1 production networking path.
- Hosted relay work is deferred unless real Even review/runtime behavior blocks wildcard
  Tailscale WSS.
- The existing Hermes wire protocol remains unchanged for this app evolution.
