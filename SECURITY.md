# Security Policy

## Reporting a vulnerability

Report security issues **privately** via GitHub Security Advisories
(repo → **Security → Report a vulnerability**), not a public issue.

## Notes for this app

- **Never commit `.env.local`.** It holds `VITE_BRIDGE_TOKEN` (and the bridge URL); it is
  gitignored. `VITE_*` values are **bundled into the client build**, so treat the token as a
  shared LAN/Tailnet secret, not a server credential — see the bridge's threat model.
- The app is a WebSocket **client**; the trust boundary lives on the bridge
  ([hermes-evenhub-bridge](https://github.com/huntsyea/hermes-evenhub-bridge) → `SECURITY.md`).
  Prefer Tailscale so the token + traffic aren't sent in cleartext over a plain LAN.
