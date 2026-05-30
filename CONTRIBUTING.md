# Contributing

The glasses-side app for Even Realities G2 — the WebSocket **client**. The server half is the
[hermes-evenhub-bridge](https://github.com/huntsyea/hermes-evenhub-bridge) repo.

## Dev setup

```bash
npm ci
npm run dev          # Vite on 0.0.0.0:5173 (LAN; the glasses must reach it)
npm test             # vitest; single test: npx vitest run tests/<file>.test.ts -t "<name>"
npm run build        # tsc typecheck + vite build
npm run sim          # desktop simulator  ·  npm run sim:check  (automated smoke)
npm run qr           # sideload QR (targets localhost; real glasses need the Mac's LAN IP)
npm run pack         # build + package to hermes-even-hub-app.ehpk
```

Copy `.env.example` → `.env.local` and set `VITE_BRIDGE_LAN_URL` + `VITE_BRIDGE_TOKEN`
(get the URL from `hermes even-g2 url` on the bridge host). **Never commit `.env.local`.**

## Pull requests

- CI must pass (`npm run build` + `npm test`, Node 20 & 22).
- The **wire protocol is a contract**: if you change `src/protocol.ts`, mirror it in the
  bridge's `protocol.py` and note it in the PR.
- `app.json`: the mic permission is **`g2-microphone`** (not `microphone`, which `evenhub pack`
  rejects), and the `network` whitelist must contain the exact bridge `ws://…:8765` URL.

## Security

Report vulnerabilities privately via GitHub Security Advisories — see `SECURITY.md`.
