# Session & Thread UI Fixes — Design

**Date:** 2026-05-30
**Branch:** `worktree-session-fix`
**Scope:** glasses-app (client) + bridge (server). Cross-cutting; spec lives in glasses-app because every symptom surfaces in the glasses UI, but several fixes are bridge-side.

## Problem

Five defects observed on the G2 glasses session experience:

1. **Session list does not update.** Creating a new session does not show that session when navigating back to the session list.
2. **Recurring "set home" message.** Each new session, the agent response is prefixed with a Hermes notice about setting a home channel.
3. **Banner divider wraps.** The divider placed around the initial (banner) message renders as multiple lines instead of one.
4. **Scroll breaks after sending.** After sending a message, the thread no longer scrolls correctly through the message history.
5. **Agent messages run together.** Consecutive agent messages render on the same line with no separating break.

## Root Causes (confirmed against code)

### Bug 1 — session list not updating
- On the list screen, tapping "＋ New session" calls `enterSession(s, null)` and sends `sessionsNew()` (`glasses-app/src/input/dispatch.ts:25`).
- `EvenG2Adapter.on_sessions_new` (`bridge/src/hermes_evenhub_bridge/adapter.py:126-127`) dispatches the `/new` command but:
  - does **not** update `self._session_by_chat[chat_id]` to the new session, and
  - sends **no** frame back (asymmetric vs. `on_sessions_switch` → `active` and `on_sessions_list` → `sessions`).
- Returning to the list double-clicks → sends `sessionsList()` (`dispatch.ts:36`), and the client *does* re-render on the `sessions` frame (`glasses-app/src/main.ts:34-36`, `state/store.ts:65`). So the client path works; the gap is server-side: `on_sessions_list` builds items from `self._session_store.list_sessions()` (`adapter.py:110`), and a bare `/new` may not persist a session entry until the first message is sent — so the new session is absent (or present but `(untitled)` and never marked active because `_session_by_chat` was not updated).
- **Exact failure to be pinned by a repro test** (which of: not-persisted vs. not-active vs. not-returned).

### Bug 2 — recurring home-channel notice
- The message is Hermes's **home channel** onboarding notice, not a filesystem directory (gateway `run.py:8767-8787`). Text: "📬 No home channel is set for Even_G2…Type /sethome…".
- It fires when **all** hold: transcript `history` is empty, platform is non-LOCAL/non-WEBHOOK, and the home-channel env var is unset.
- `/new` resets to a fresh session with empty history, so `not history` is true on the next message every time.
- `_home_target_env_var("even_g2")` resolves to `EVEN_G2_HOME_CHANNEL` (fallback; the bridge never registers a `cron_deliver_env_var`), and that env var is never set — so the gate always passes and the notice repeats.
- It reaches the glasses because `_deliver_platform_notice` → `EvenG2Adapter.send` (`adapter.py:71`) emits it as an `assistant.delta`.

### Bug 3 — banner divider wraps
- `glasses-app/src/ui/stream.ts:3`: `const RULE = "─".repeat(40)`. Forty U+2500 box-drawing chars exceed the 576px body container width on the non-monospace firmware font, so the firmware wraps the rule onto a second display line. The banner renders `RULE \n body \n RULE` (`stream.ts:8-10`), so each rule wraps.

### Bug 4 — scroll breaks after sending
- The review→send transition (`glasses-app/src/input/dispatch.ts:61-66`) builds the next state without `scrollPage: null`, unlike `enterSession` (`dispatch.ts:17`). After a prior scroll-up, `scrollPage` holds a stale absolute page index; appending the user/agent text re-paginates, but `threadPage` (`glasses-app/src/ui/views.ts:40-44`) keeps showing the held (now-stale) page instead of following the latest.

### Bug 5 — agent messages run together
- The client coalesces all `assistant.delta` / `assistant` frames into a single stream item via `appendStream` (`glasses-app/src/state/store.ts:40-48`), which just concatenates `last.text + delta` with no separator.
- The bridge starts a **new** logical message on `send()` (which calls `state.reset()`, `adapter.py:73`) but only **continues** on `edit_message()` (no reset). The client cannot tell a new `send()` message from a continuation — both are `assistant.delta`.
- The most common trigger is Bug 2: the home-channel notice (`send()`) and the real reply (`send()`/`edit_message`) merge into one run-together item. **Fixing Bug 2 removes the dominant case.** A repro test determines whether a residual message-boundary problem remains for legitimately-consecutive agent messages.

## Fix Design

### Bug 2 — Home-channel notice (chosen approach: bridge registers + auto-sets)
- `bridge/src/hermes_evenhub_bridge/__init__.py:16`: add `cron_deliver_env_var="EVEN_G2_HOME_CHANNEL"` to the `register_platform(...)` call so Hermes resolves the platform's home-channel env var cleanly.
- On first device touch, the bridge persists `EVEN_G2_HOME_CHANNEL=<chat_id>` when unset, using the same `save_env_value` call the gateway's `/sethome` handler uses (`run.py:11140-11176`), plus setting `os.environ` for the live process. Location: device connect / first `on_text`, whichever is the single clean first-touch point (decided during implementation after reading `server.py` hello flow).
- Net effect: the `not history` + unset-env gate stops firing; the notice never reaches the glasses again. Self-healing, lives in this repo, survives a fresh machine.

### Bug 1 — New session appears in list
- `on_sessions_new` (`adapter.py:126`): after dispatching `/new`, update `_session_by_chat[chat_id]` to the freshly created session id and emit a fresh `P.sessions(items, active)` frame (symmetric with `switch`/`list`), ensuring the session is actually persisted/visible. Exact mechanism confirmed by the repro test first.

### Bug 3 — Divider fits one line
- Replace the fixed `"─".repeat(40)` with a width measured to fit the body container on one line. Use the `everything-evenhub:font-measurement` skill to compute the max U+2500 count at 576px (estimate ~30; exact value from measurement), and verify on the simulator. Cap the rule at the measured max.

### Bug 4 — Scroll follows latest after send
- `dispatch.ts:64`: add `scrollPage: null` to the review→send result state.

### Bug 5 — Clean breaks between messages
- Primarily resolved by Bug 2. Add a repro test for two consecutive `send()`-style messages within one turn. **Only if** the repro still shows run-together output do we introduce a message-boundary signal — which is a **synchronized** `glasses-app/src/protocol.ts` + `bridge/src/hermes_evenhub_bridge/protocol.py` change (the wire protocol is a contract and both must stay in sync). This is conditional scope, not assumed.

## Testing Strategy

Pure logic is unit-tested first (TDD):
- **Bug 4:** vitest — review→send transition asserts `scrollPage === null`.
- **Bug 3:** vitest — `RULE.length` ≤ measured one-line cap.
- **Bug 1:** pytest — drive `on_sessions_new` then `on_sessions_list`; assert the new session is present and active. Use as the failing repro that defines the fix.
- **Bug 5:** pytest/vitest repro — two consecutive messages in one turn render with a separating break.
- **Bug 2:** pytest — after first connect, `EVEN_G2_HOME_CHANNEL` is set (process env and/or persisted).

Integration / manual:
- `npm test` and `uv run pytest -q` both green.
- Simulator pass for the visual bugs (3, 5).
- Live check: `hermes gateway restart`, create a new session on the glasses, confirm the home-channel notice no longer prepends the reply (Bug 2) and the new session shows in the list (Bug 1).

## Out of Scope
- Any redesign of the banner contents (model/cwd) beyond the divider width.
- The protocol message-boundary change unless the Bug 5 repro proves it necessary.
- Unrelated refactoring of the streaming/pagination pipeline.
