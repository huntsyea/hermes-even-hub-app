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

## Gesture Map

### Chat view

| Gesture | Action |
|---------|--------|
| Single tap | Send a text turn |
| Double tap | Toggle mic (voice input) |
| Scroll up | Open sessions list |
| Scroll down | Stop/interrupt active turn |

### Sessions view

| Gesture | Action |
|---------|--------|
| Single tap | Switch to highlighted session |
| Double tap | Create new session |
| Scroll | Native firmware list scrolling |

## Status Indicators

| Display | Meaning |
|---------|---------|
| `connecting <url>` | Connecting to bridge |
| `connected` | Ready for input |
| `🎤 listening` | Mic is active, recording voice |
| `⚙ <tool>...` | Tool call in progress |
| `✓ <tool>` | Tool call completed |
| `✓ done` | Turn completed (while watching) |
| `✓ reply ready` | Turn completed while on sessions view |

## Voice Input

Double-tap to start recording. The mic captures PCM audio (16 kHz, s16le, mono) and streams it as binary WebSocket frames to the bridge. Double-tap again to stop. The bridge transcribes via `faster-whisper` and feeds the text to Hermes.

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
