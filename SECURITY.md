# Security Policy

## Reporting a vulnerability

Report security issues **privately** via GitHub Security Advisories
(repo → **Security → Report a vulnerability**), not a public issue.

## Notes for this app

- The bridge URL and token are entered at runtime in the phone companion UI and persisted with
  the Even SDK local storage API on the user's phone. Do not hard-code or commit private bridge
  URLs or tokens.
- `.env.local` is only for optional developer defaults. Any `VITE_*` value is bundled into the
  client build, so do not use it for production secrets.
- The app is a WebSocket **client**; the trust boundary lives on the bridge
  ([hermes-evenhub-bridge](https://github.com/huntsyea/hermes-evenhub-bridge) → `SECURITY.md`).
  Prefer Tailscale Serve `wss://` so the token and traffic are not sent in cleartext over a
  plain LAN.
