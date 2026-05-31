# Session History & Experience Recovery Plan

**Date:** 2026-05-31
**Scope:** `/Users/huntsyea/Dev/hermes-evenhub-bridge` and `/Users/huntsyea/Dev/hermes-even-hub-app`

## Goal

Make the G2 session experience behave like a real Hermes session browser:

- Creating a new session makes that session visible and active.
- Opening an existing session loads its prior conversation instead of showing a blank thread.
- Returning to the session list reflects new sessions, title changes, and active-session state.
- "Session reset" and Hermes onboarding notices do not leak into the glasses thread.
- Scrolling, status text, and empty/loading states make the flow understandable on hardware.

## Current State

Already present in current source:

- Bridge suppresses the internal `/new` "Session reset" output.
- Bridge materializes a new session after `/new`, marks it active, and emits an updated `sessions` frame.
- App refreshes the session list when returning from a session.
- App resets scroll follow mode when sending a reviewed transcript.
- Banner divider has been reduced to a measured one-line rule.

Work in progress, not yet deployed:

- Bridge emits a new `history` frame after `sessions.switch`.
- App parses `history` and replaces the local stream with stored items.
- Unit tests cover the basic protocol and reducer path.

Remaining risk in the current work in progress:

- The `history` frame should include the `session_id` it belongs to, so the app can ignore stale history if session switches happen quickly.
- `sessions.new` should also return a consistent active/empty-history state so new-session behavior mirrors switch behavior.
- Live behavior still needs to be verified against the Mac mini gateway database and real glasses.

## Phase 1: Make Session Switching Correct

Bridge protocol:

- Define `history` as `{ t: "history", id: session_id, items: StreamItem[], ok: boolean }`.
- Emit `active` then `history` after `sessions.switch`.
- Emit `active`, `sessions`, and `history` with an empty item list after `sessions.new`.
- Keep `sessions.list` read-only and fast.

Bridge history extraction:

- Read messages from the Hermes session DB via a small adapter helper.
- Include only user and assistant messages.
- Skip system, tool, internal command, empty, and malformed rows.
- Normalize multimodal content arrays into displayable text.
- Add a reasonable payload guard, such as latest N user/assistant messages or a max character budget, while preserving chronological order.
- If history loading fails, send an empty history frame and log the warning; do not break switching.

App protocol/state:

- Parse `history` with `id`.
- Apply history only when `history.id === state.sessions.active`.
- Replace the stream, clear pending transcript, set phase to idle, set turn to idle, and reset scroll follow mode.
- Preserve current blank local stream while history is loading, but show a clear loading/empty state.

Tests:

- Bridge unit test: `sessions.switch` emits `active` then `history` with the selected id.
- Bridge unit test: `sessions.new` emits active/list/empty-history and suppresses reset output.
- Bridge unit test: history extraction skips unsupported roles and decodes content arrays.
- App protocol test: parses `history` with id.
- App reducer test: applies matching history.
- App reducer test: ignores stale history for a non-active id.

## Phase 2: Improve The Session List Experience

List freshness:

- Keep refreshing on return-to-list.
- Also refresh after `sessions.new` completes so the list has the new active item without waiting for navigation.
- Sort newest-first in one place and keep index mapping aligned with rendered rows.

List labels:

- Use stable, short labels on glasses:
  - Active session marker.
  - Untitled new sessions shown as "New session" or timestamped "New session HH:MM".
  - Titles truncated with measured text width, not only character count.
- Keep the native list container because firmware scrolling is the right primitive for the session browser.

Empty and loading states:

- Session list empty: `+ New session` plus a concise "No sessions" row only if firmware requires at least one item.
- Switching session: body should read `loading session...` until history arrives.
- Loaded empty session: body should read `tap to speak`.
- Error loading history: body should stay usable and status should say `history unavailable`.

Tests:

- App view tests for active marker, untitled title, and no-session state.
- App dispatch tests for list index mapping after sort.
- App reducer/view test for loading and empty history states.

## Phase 3: Smooth The Thread Reading Experience

History rendering:

- Keep user messages prefixed with `>`.
- Keep tool rows compact.
- Ensure assistant messages are separated by newlines when rendered from history.
- Keep banner content distinct from actual conversation history.

Scrolling:

- Retain paginated text windows with overlap.
- Always return to follow mode when:
  - Sending a transcript.
  - Receiving new assistant/tool output.
  - Loading a different session history.
- Show page position only when there is more than one page.

Status bar:

- Idle with empty stream: `ready`.
- Loading history: `loading session...`.
- Recording/transcribing/review states stay as-is.
- Working state names active tool when available.

Tests:

- Stream tests for history with multiple assistant turns.
- Dispatch/reducer tests for scroll follow reset on new output and history load.
- View tests for page indicators and empty/loading body text.

## Phase 4: End-To-End Verification

Local automated gates:

- Bridge: `uv run --with hermes-agent pytest "tests/test_protocol.py" "tests/test_adapter_sessions.py" -q`
- Bridge lint: `uv run --locked ruff check "protocol.py" "adapter.py" "tests/test_protocol.py" "tests/test_adapter_sessions.py"`
- App tests: `npm test -- --run`
- App build: `npm run build`

Bridge websocket smoke:

- Connect to the Mac mini bridge websocket.
- Send `hello`.
- Send `sessions.list` and capture a real existing session id.
- Send `sessions.switch` for that id.
- Verify frames arrive in order:
  - `active` with the target id.
  - `history` with the same id.
  - history contains prior user/assistant items when the target session has messages.
- Send `sessions.new`.
- Verify no assistant `"Session reset"` frame appears.
- Verify the new session appears in `sessions`.
- Verify empty `history` arrives for the new session.

Hardware acceptance test:

1. Restart bridge/gateway on the Mac mini.
2. Launch the G2 app with glasses connected.
3. On the list, create a new session.
4. Speak a short message and send it.
5. Return to the list; confirm the new session appears and is active.
6. Open an older session; confirm old transcript loads and can be scrolled.
7. Return to list and reopen the new session; confirm its transcript loads.
8. Confirm "Session reset" is not shown.
9. Confirm no recurring home-channel onboarding notice is shown.
10. Confirm status text and page indicators are legible on hardware.

## Phase 5: Rollout

Commit structure:

- Bridge commit: protocol/history/session-new behavior and tests.
- App commit: history parsing/reducer/loading UX and tests.
- Optional docs commit can be folded into the app commit if small.

Deployment:

- Push bridge repo.
- Update installed bridge plugin on the Mac mini through the dashboard API.
- Restart gateway.
- Build/package/deploy the glasses app according to the current Even Hub workflow.
- Re-run websocket smoke and hardware acceptance test.

Rollback:

- Bridge rollback: reset installed plugin to the previous known-good bridge commit and restart gateway.
- App rollback: redeploy the previous known-good glasses app package.
- If only history hydration regresses, disable `history` emission first; the older app ignores unknown frames poorly, so protocol compatibility must be considered before mixed-version deploys.

## Definition Of Done

- Existing-session click opens that session, loads old messages, and scrolls through them on glasses.
- New-session click creates a distinct active session without leaking "Session reset".
- Session list changes after create/send are visible after returning to the list.
- Old and new sessions can be switched repeatedly without blank or stale transcripts.
- Automated bridge and app tests pass.
- Mac mini websocket smoke passes against real session storage.
- Hardware acceptance test passes with connected glasses.
