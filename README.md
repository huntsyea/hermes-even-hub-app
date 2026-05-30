# Even G2 + Hermes Agent Client

Drive a locally-running [Hermes agent](https://github.com/NousResearch/hermes-agent) hands-free from Even Realities G2 smart glasses. Talk to it, watch replies stream, see tool calls, and switch sessions.

## Architecture

Two pieces connected over your LAN (or Tailscale for remote):

1. **Bridge plugin** (`hermes-evenhub-bridge`) — Python Hermes plugin that hosts a WebSocket server and proxies to the Hermes API server.
2. **Glasses app** (this repo) — TypeScript Even Hub app running in the phone WebView, rendering on the 576x288 glasses display.

## Setup

### 1. Hermes API server

Ensure `~/.hermes/.env` contains:

```
API_SERVER_ENABLED=true
API_SERVER_KEY=<your-key>
EVENHUB_BRIDGE_TOKEN=<shared-secret>
```

Start the gateway:

```bash
hermes gateway restart
```

### 2. Bridge plugin

The bridge lives at `~/Dev/hermes-evenhub-bridge` and is symlinked into `~/.hermes/plugins/`. It starts automatically when Hermes loads.

### 3. Glasses app

Create `.env.local` (gitignored):

```
VITE_BRIDGE_LAN_URL=ws://10.0.0.2:8765
VITE_BRIDGE_TOKEN=<same-shared-secret>
```

For remote via Tailscale, also add:

```
VITE_BRIDGE_REMOTE_URL=ws://<mac>.tail-xxxx.ts.net:8765
```

And add the Tailscale URL to the `app.json` network whitelist.

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

Produces `even-development.ehpk`. Sideload via `evenhub qr` during development.

## References

- [Even Hub docs](https://hub.evenrealities.com/docs/getting-started/installation)
- [Simulator](https://hub.evenrealities.com/docs/reference/simulator)
- [CLI](https://hub.evenrealities.com/docs/reference/cli)
- [Claude Code plugin](https://hub.evenrealities.com/docs/AI-tooling/claude%20code/)
