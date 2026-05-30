---
name: run-glasses-app
description: Run, launch, build, test, or screenshot the Even G2 glasses app (the Vite WebView app rendered on the Even Realities G2). Use when asked to start the glasses app, drive the Even Hub simulator, capture a 576x288 glasses screenshot, or confirm a UI/render/input change works in the actual running app.
---

# Run the Even G2 glasses app

The glasses app is a TypeScript + Vite WebView app that renders on the Even
Realities G2 display (576×288). You don't need real hardware: the
**Even Hub simulator** renders the app in a native window and exposes an
**automation HTTP API** (`/api/ping`, `/api/console`, `/api/input`,
`/api/screenshot/glasses`). The driver is
`.claude/skills/run-glasses-app/sim-drive.mjs` — it talks to that API so you can
send gestures and grab the glasses render programmatically.

All paths below are relative to the `glasses-app/` package root.

> Verified on macOS (darwin, arm64) — the simulator ships per-platform native
> binaries (`@evenrealities/sim-darwin-arm64`). It opens a real window, so it
> needs a display server; on a headless box wrap the `npm run sim` step in
> `xvfb-run` (not verified here).

## Prerequisites

- Node ≥ 22, npm ≥ 10 (verified: node v24.16.0, npm 11.13.0).
- `npm install` — installs deps including `@evenrealities/evenhub-simulator`
  and the `evenhub` CLI (already vendored in `node_modules/.bin`).

## Build

```bash
npm run build      # tsc + vite build -> dist/
```

To package a sideloadable `.ehpk` for real glasses: `npm run pack`.

## Run (agent path) — simulator + driver

The simulator needs the Vite dev server already running. Use **two terminals**
(or background the first two), then drive with the script.

```bash
# 1. dev server (Vite on 0.0.0.0:5173)
npm run dev

# 2. simulator with the automation port the driver expects
npx evenhub-simulator http://localhost:5173 --automation-port 9898
#    (equivalently: npm run sim — same target, same port)

# 3. drive it
node .claude/skills/run-glasses-app/sim-drive.mjs ready          # wait for "[glasses] ready"
node .claude/skills/run-glasses-app/sim-drive.mjs shot before    # docs/e2e/before.png
node .claude/skills/run-glasses-app/sim-drive.mjs input down     # send a gesture (scroll)
node .claude/skills/run-glasses-app/sim-drive.mjs turn "hi" after# click->wait->screenshot
node .claude/skills/run-glasses-app/sim-drive.mjs console 20     # tail in-app console
```

Screenshots land in `docs/e2e/`. **Open the PNG and look at it** — a real run
shows the green G2 render (e.g. `Hermes ●`, model/provider lines, `ready for
input`). The simulator's `/api/input` accepts exactly four gestures:
`click double_click up down` — any other string returns HTTP 400.

### One-shot smoke (the existing committed harness)

`scripts/smoke-sim.mjs` (run via `npm run sim:check`) does ready → click →
screenshot → tail console in one go. Use it to confirm the whole pipeline:

```bash
npm run sim:check
# -> "OK - simulator responded, app rendered, click triggered a turn"
#    Screenshot saved: docs/e2e/smoke-<ts>.png
```

## Run (human path)

`npm run qr` prints a sideload QR, but it targets `localhost`; real glasses need
the Mac's LAN IP: `npx evenhub qr --url http://<lan-ip>:5173`. Useless for
headless verification — use the simulator path above.

## Test

```bash
npm test           # vitest — verified: 11 files, 75 tests passed
```

## Gotchas

- **The simulator does not start the dev server.** Start `npm run dev` first or
  the simulator loads a blank/erroring page. The driver's error hint reminds you
  to check this.
- **`/api/input` only accepts `click double_click up down`.** Everything else
  (`swipe_up`, `long_press`, `tap`, `triple_click`, …) returns HTTP 400 — the
  simulator validates the gesture name. The driver surfaces that 400 as an
  error. A 200 means the gesture was delivered, but check `console`/a screenshot
  to confirm the app reacted.
- **`double_click` is EXIT** — don't send it in a screenshot flow unless you
  mean to leave the current view. `click` in a session triggers a turn; `up`/
  `down` scroll the list/stream.
- **`turn` lands on the recording view (often near-blank).** A `click` from an
  idle session starts mic capture, so the screenshot right after shows the
  recording state, not a streamed reply. To capture a rendered reply you need a
  connected bridge + a real voice/text round trip. For a guaranteed full render,
  use `shot` on the list/session view or `npm run sim:check`.
- **Only `/api/screenshot/glasses` exists.** `/api/screenshot`,
  `/api/screenshot/window`, etc. all 404.
- **`timeout` is not on macOS.** The `timeout 60 node ...` idiom fails with
  `command not found`; drop it or use `gtimeout` (coreutils).
- **The app connects to the bridge** at `VITE_BRIDGE_LAN_URL` from `.env.local`
  (`ws://…:8765`). If a Hermes bridge is running on the LAN, the render shows a
  live session; if not, the app still renders but stays in a connecting state.
  Copy `.env.example` → `.env.local` and set the URL + token if needed.

## Troubleshooting

- `app never logged "[glasses] ready"` → the dev server isn't up, or the
  simulator was pointed at the wrong URL. Confirm `curl -s -o /dev/null -w
  "%{http_code}" http://localhost:5173` returns `200`, then relaunch the sim.
- `ERROR: /api/ping -> …` / connection refused → the simulator isn't running
  with `--automation-port 9898`. Relaunch it (`npm run sim`).
