## What & why

<!-- What does this change and why? Link any issue. -->

## Checklist
- [ ] `npm run build` passes (tsc typecheck + bundle)
- [ ] `npm test` passes
- [ ] If the wire protocol changed, `src/protocol.ts` and the bridge's `protocol.py` were updated together (see README)
- [ ] No secrets committed (`.env.local` stays untracked)
- [ ] `app.json` permissions / `network` whitelist still correct if connection/mic behavior changed
