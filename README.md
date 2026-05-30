# hermes-even-hub-app

Drive a locally-running [Hermes agent](https://github.com/NousResearch/hermes-agent) hands-free
from Even Realities G2 smart glasses. Talk to it, watch replies stream, see tool calls, and switch
sessions.

This is the **glasses-side app** (the WebSocket **client**). The server half — the Hermes plugin
that hosts the WebSocket and bridges to the agent — is its sister repo,
**[hermes-evenhub-bridge](https://github.com/huntsyea/hermes-evenhub-bridge)**.

> **The wire protocol is a contract:** `src/protocol.ts` here and `protocol.py` in the bridge must
> stay in sync — when you change one, update the other.

## Architecture

```
G2 glasses (576×288 + mic)
        ▲
        │  Even Hub WebView
  this app (TypeScript / Vite)  ──JSON frames + PCM, ws:// (LAN / Tailscale)──▶  hermes-evenhub-bridge
        ▲                                                                              │
        └──────────────  assistant deltas · tool status · transcripts  ◀──────────────┘  → Hermes agent
```

## Setup

1. **Install + run the bridge** on the Mac — see
   [hermes-evenhub-bridge](https://github.com/huntsyea/hermes-evenhub-bridge):
   `hermes plugins install huntsyea/hermes-evenhub-bridge`, set `EVENHUB_BRIDGE_TOKEN` in
   `~/.hermes/.env`, enable it, restart the gateway.
2. **Get the connect URL** from the bridge host: `hermes even-g2 url`
   (Tailscale-aware — works off the local Wi-Fi).
3. **Configure this app** — copy `.env.example` → `.env.local` (gitignored):
   ```
   VITE_BRIDGE_LAN_URL=ws://<host>:8765
   VITE_BRIDGE_TOKEN=<same shared secret>
   # optional, for remote over Tailscale:
   VITE_BRIDGE_REMOTE_URL=ws://<mac>.tailnet-xxxx.ts.net:8765
   ```
   Add that exact `ws://…` URL to `app.json`'s `network` whitelist, then `npm run dev`
   (or `npm run pack` + `npm run qr` to sideload to real glasses).

> `VITE_*` values are baked into the client bundle — treat the token as a shared LAN/Tailnet
> secret. **Never commit `.env.local`.**

## Commands

```bash
npm run dev          # Vite dev server (for simulator or sideloading)
npm run sim          # Launch the Even Hub simulator
npm run sim:check    # Automated smoke test against the simulator
npm run qr           # QR code for sideloading to real glasses
npm run pack         # Build + package as .ehpk
npm run test         # Run vitest suite
```

## Interaction model (Terminal-style)

The app is list-first and voice-only, mirroring Even Realities Terminal mode. It boots
to the session list; you open or create a session, then drive it by voice:
tap to record, tap to stop, review the transcript, tap to send.

States: `list → session(idle) → recording → transcribing → review → idle`.

### Gesture Map

| State | Swipe ↑/↓ | Tap | Double-press |
|-------|-----------|-----|--------------|
| **List** | scroll sessions | open highlighted row / `＋New` | **exit app** (system dialog) |
| **Session · idle** | scroll chat history | **start recording** | back to list |
| **Session · recording** | — | **stop → transcribe → review** | cancel recording → idle |
| **Session · review** | ↓ = **redo** (discard, re-arm) | **send** to Hermes | back to list (discard) |

### Session screen

A terminal-style stream: `>` your entries, `/` tool calls (`/ name` running, `/ name ✓`
done), and plain wrapped lines for the assistant. The header shows the session title +
a connection dot (`●` connected / `◌` reconnecting). A bottom **agent-state bar** shows
what's happening now:

| Bar | Meaning |
|-----|---------|
| `ready for input` | session open, awaiting your tap |
| `🎤 recording…` | mic on (tap to stop) |
| `transcribing…` | Whisper running on the Mac |
| `tap = send · swipe↓ = redo` | transcript shown, awaiting confirm |
| `thinking…` | turn sent, before first token |
| `working… (<tool>)` | a tool is active |

## Voice Input

Inside a session, **tap to start recording**; the mic captures PCM audio (16 kHz, s16le,
mono) and streams it as binary WebSocket frames to the bridge. **Tap again to stop** — the
bridge transcribes via `faster-whisper` and returns the transcript. You **review** it on
the glasses, then **tap to send** it to Hermes (or **swipe down to redo**). Assistant
replies stream back as incremental deltas and interleave with tool-call lines.

## Packaging

```bash
npm run pack
```

Produces `hermes-even-hub-app.ehpk`. Sideload via `evenhub qr` during development.

## References

- [Even Hub docs](https://hub.evenrealities.com/docs/getting-started/installation)
- [Simulator](https://hub.evenrealities.com/docs/reference/simulator)
- [CLI](https://hub.evenrealities.com/docs/reference/cli)
- [Claude Code plugin](https://hub.evenrealities.com/docs/AI-tooling/claude%20code/)
