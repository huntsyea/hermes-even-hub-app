# Even Realities G2 — Real-Glasses End-to-End Verification — Design

**Date:** 2026-05-29
**Branch:** `verify/g2-real-glasses` (Even-Development repo)
**Status:** Approved design, pending implementation plan

## Summary

Verify that the rebuilt Hermes plugin (`hermes-evenhub-bridge`, now a `kind: platform`
adapter) works end-to-end with the current Even-Development glasses app on **real G2
hardware**, plus the Hermes dashboard UI. The verification loads the live app onto the
glasses over LAN (dev-server + QR), then walks a manual UX checklist while observing the
bridge/gateway logs and dashboard live.

This is a **verification effort**, not a feature build: the deliverable is a repeatable
checklist plus the minimal prep to make a real-glasses run connect on the first try.

## Already verified (during brainstorming — no further action)

- **Protocol compatibility (by inspection):** the glasses app `src/protocol.ts` sends
  exactly the client frames the bridge accepts (`hello`, `sessions.list/switch/new`,
  `text`, `stop`, `audio.start/stop`) and parses exactly the server frames the adapter
  emits (`hello.ok`, `sessions`, `active`, `transcript`, `assistant.delta`,
  `tool.start/end`, `turn.done`, `error`).
- **Network alignment:** Mac LAN IP is `10.0.0.2`, matching both
  `VITE_BRIDGE_LAN_URL=ws://10.0.0.2:8765` and the `app.json` network whitelist.
- **Auth:** `VITE_BRIDGE_TOKEN` == `EVENHUB_BRIDGE_TOKEN` (confirmed by sha256, not
  revealed).
- **Infra:** gateway running; bridge listening on `0.0.0.0:8765`; `even_g2` shows
  `state: connected` in `gateway_state.json`; the dashboard (launchd
  `com.huntsyea.hermes-dashboard`) was restarted and now lists `even_g2` under Connected
  Platforms.

## Goal

Confirm, on real G2 hardware, that a user can: boot the app, open/create a session,
pair the device, speak a turn, see the streamed reply + tool status + turn completion,
switch sessions, and recover from a brief disconnect — with the dashboard reflecting live
device status throughout.

## Non-Goals

- Simulator-based verification (a separate, already-available path).
- The Even Realities native "custom agents" integration (a different path; out of scope —
  this verifies our WebView app + bridge).
- Automated/CI verification of the on-glasses UX (it is hardware-in-the-loop / manual).
- Any change to the wire protocol or the bridge adapter (already complete and unit-tested).

## Approach

**Load method: dev-server + QR (chosen over packed `.ehpk` for the verification pass).**
The glasses load the live app from the Mac over LAN, so a fix is an edit + reload rather
than a rebuild + reinstall. A packed `.ehpk` install is an optional final confirmation of
the production artifact.

The only code change anticipated: the `qr` npm script currently targets
`http://localhost:5173`, which does not resolve on the glasses. It must target the Mac's
LAN IP (`http://10.0.0.2:5173`). This will be handled in the plan (either a new script or
an argument), not by hand-editing during the run.

## Prep steps (operator: the assistant)

1. Confirm gateway + bridge health: `even_g2` connected, port 8765 listening.
2. Start the Vite dev server bound to the LAN: `npm run dev` (already `--host 0.0.0.0`).
3. Generate a sideload QR pointing at `http://10.0.0.2:5173` (the LAN dev URL).
4. Begin tailing the bridge/gateway logs and watching the dashboard `/even-g2` tab so each
   checklist step can be corroborated with server-side evidence.

## On-glasses checklist (operator: the user; assistant corroborates from logs/dashboard)

| # | Action on glasses | Expected on glasses | Server-side corroboration |
|---|-------------------|---------------------|---------------------------|
| 1 | Scan QR, launch app | Boots to **session list** (terminal-mode) | WS `hello` accepted; `hello.ok` sent; device registered |
| 2 | Open / create a session | Connection dot connected; **pairing code** shown on first turn | Gateway emits pairing prompt for `even_g2` |
| 3 | Approve pairing | — | Assistant runs `hermes pairing approve even_g2 <code>`; device authorized |
| 4 | Tap to record → speak → tap stop | `🎤 recording` → `transcribing…` → transcript shown for review | `audio.start` / PCM frames / `audio.stop`; adapter mic status `transcribing`→`idle`; `transcript` frame |
| 5 | Tap to send | `thinking…` → reply streams incrementally → `turn.done` (bar = ready) | `assistant.delta` frames (deltas), then `turn.done` after the `_active_sessions` guard clears |
| 6 | (If a tool runs) | `/ tool` running → `/ tool ✓` | `pre_tool_call`/`post_tool_call` hooks emit `tool.start`/`tool.end` scoped to the device |
| 7 | Swipe to scroll history | Native scroll of the terminal stream | — |
| 8 | Switch session from the list | Loads the chosen session | `sessions.list` → `sessions`; `sessions.switch` → `active` |
| 9 | Swipe-down "redo" on a review | Transcript discarded, re-armed | — (client-side) |
| 10 | Toggle Wi-Fi off/on briefly | Dot shows reconnecting → recovers | Reconnect-safe `unregister` (ws-guarded); fresh `hello` on reconnect |

## Dashboard checks (operator: the assistant)

- **Connected Platforms** lists G2 (`even_g2` / "Even Realities G2" caveat noted
  separately — the pill renders the platform key).
- **`/even-g2` tab** live status: `connected` count → 1 while glasses are connected; `mic`
  reflects `transcribing` during recording; `active_session` shows the open session title.

## Success criteria

Every checklist row (1–10) behaves as the "Expected on glasses" column describes, and each
server-interacting row has matching log/dashboard evidence in the corroboration column.
Any deviation is captured as a defect with the observed vs expected behavior and the
relevant log excerpt.

## Risks / open items

- **Pairing is required** before the agent will respond (a real turn returns a pairing
  code until approved). Row 3 handles it; without approval, rows 5–6 cannot pass.
- **Glasses must be on the same LAN** as the Mac (`10.0.0.2`). If the user is remote, the
  Tailscale path (`100.97.124.81`) + `VITE_BRIDGE_REMOTE_URL` + an added `app.json`
  whitelist entry would be needed — out of scope for this LAN-based pass.
- **Dev-server reachability:** the glasses must reach `http://10.0.0.2:5173`; a Mac
  firewall blocking inbound 5173 would prevent app load.
