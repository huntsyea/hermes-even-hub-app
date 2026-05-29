# Even G2 Development

Local starter environment for building Even Realities G2 apps with Vite, TypeScript, the Even Hub SDK, the EvenHub CLI, and the EvenHub Simulator.

## Requirements

- Node.js 20 LTS or 22+
- Even Realities app and G2 glasses for hardware testing
- Claude Code with the `everything-evenhub` plugin enabled for Even-specific coding skills

## Commands

```bash
npm run dev
npm run sim
npm run sim:check
npm run qr
npm run pack
```

Run `npm run dev` in one terminal, then `npm run sim` in another. The simulator control plane is exposed at `http://127.0.0.1:9898`, and `npm run sim:check` runs the documented smoke-test flow against it.

For hardware sideloading, replace the localhost URL in `npm run qr` with the Mac's LAN IP address:

```bash
evenhub qr --url "http://192.168.1.100:5173"
```

The app manifest lives in `app.json`, and `npm run pack` builds `dist/` and writes `even-development.ehpk`.

## References

- Installation: https://hub.evenrealities.com/docs/getting-started/installation
- Simulator: https://hub.evenrealities.com/docs/reference/simulator
- CLI: https://hub.evenrealities.com/docs/reference/cli
- Claude Code plugin: https://hub.evenrealities.com/docs/AI-tooling/claude%20code/
