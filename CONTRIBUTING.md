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

The bridge URL and token are configured at runtime in the phone companion UI. `.env.local` is
optional and only pre-fills developer defaults; never put production secrets in `VITE_*` values.

## Pull requests

- CI must pass (`npm run build` + `npm test`, Node 20 & 22).
- The **wire protocol is a contract**: if you change `src/protocol.ts`, mirror it in the
  bridge's `protocol.py` and note it in the PR.
- `app.json`: the mic permission is **`g2-microphone`** (not `microphone`, which `evenhub pack`
  rejects). The default network whitelist targets Tailscale Serve with `https://*.ts.net` and
  `wss://*.ts.net`; exact `ws://...` hosts are local sideload-only changes.

## Security

Report vulnerabilities privately via GitHub Security Advisories — see `SECURITY.md`.
