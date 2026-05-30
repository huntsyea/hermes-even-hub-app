# Session & Thread UI Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five defects in the G2 glasses session experience: stale session list, recurring Hermes home-channel notice, wrapping banner divider, broken scroll after send, and run-together agent messages.

**Architecture:** Two halves over the JSON wire protocol. Client fixes (Bugs 3, 4, and the Bug 5 repro) are pure functions in `glasses-app/src`, unit-tested with vitest. Server fixes (Bugs 1, 2, and the conditional Bug 5 boundary) are in the `EvenG2Adapter` / plugin registration, unit-tested with pytest against the installed Hermes gateway (`tests/conftest.py` wiring). No wire-protocol frame shapes change.

**Tech Stack:** TypeScript + Vite + vitest (glasses-app); Python + uv + pytest (bridge); `@evenrealities/pretext` for pixel-accurate font measurement in tests.

**Spec:** `glasses-app/docs/superpowers/specs/2026-05-30-session-thread-ui-fixes-design.md`

**Worktree/branch:** work happens in the existing worktree on branch `worktree-session-fix`.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `glasses-app/src/input/dispatch.ts` | Modify (`:61-66`) | Bug 4 — reset `scrollPage` on review→send |
| `glasses-app/tests/dispatch.test.ts` | Modify | Bug 4 test |
| `glasses-app/src/ui/stream.ts` | Modify (`:3`) | Bug 3 — divider width fits one line |
| `glasses-app/tests/stream.test.ts` | Modify | Bug 3 test (pixel-measured) |
| `glasses-app/package.json` | Modify | Add `@evenrealities/pretext` devDependency |
| `glasses-app/tests/store.test.ts` | Modify | Bug 5 repro (client coalescing behavior) |
| `bridge/src/hermes_evenhub_bridge/__init__.py` | Modify (`:16`) | Bug 2 — register `cron_deliver_env_var` |
| `bridge/src/hermes_evenhub_bridge/adapter.py` | Modify | Bug 2 helper + on_text wiring; Bug 1 new-session push; (conditional) Bug 5 boundary |
| `bridge/tests/test_register.py` | Modify | Bug 2 registration test |
| `bridge/tests/test_adapter_sessions.py` | Modify | Bug 1 + Bug 2 adapter tests |

Tasks are ordered cheapest/highest-confidence first. Tasks 1–4 are independent; Task 5 depends on Task 3 (home-channel) being live-verified.

---

## Task 1: Bug 4 — Scroll follows latest after sending a message

**Files:**
- Modify: `glasses-app/src/input/dispatch.ts:61-66`
- Test: `glasses-app/tests/dispatch.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the `describe("dispatch: session review", …)` block in `glasses-app/tests/dispatch.test.ts`:

```ts
it("tap send resets scroll to follow mode (null)", () => {
  const r = dispatch({ ...review("hello"), scrollPage: 3 }, "click");
  expect(r.state.scrollPage).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd glasses-app && npx vitest run tests/dispatch.test.ts -t "resets scroll to follow"`
Expected: FAIL — `expected 3 to be null` (current code spreads `...s`, keeping `scrollPage: 3`).

- [ ] **Step 3: Write minimal implementation**

In `glasses-app/src/input/dispatch.ts`, the `s.phase === "review"` → `g === "click"` branch, add `scrollPage: null` to the returned state:

```ts
if (s.phase === "review") {
  if (g === "click" && s.pending) {
    const text = s.pending.transcript;
    return {
      state: { ...s, stream: [...s.stream, { kind: "user", text }], pending: null, phase: "idle", turn: "thinking", scrollPage: null },
      effects: [{ kind: "send", frame: textMsg(text) }],
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd glasses-app && npx vitest run tests/dispatch.test.ts`
Expected: PASS (all dispatch tests green).

- [ ] **Step 5: Commit**

```bash
git add glasses-app/src/input/dispatch.ts glasses-app/tests/dispatch.test.ts
git commit -m "fix(glasses): reset scroll to follow mode when sending a message"
```

---

## Task 2: Bug 3 — Banner divider fits one display line

The divider is `"─".repeat(40)`. Measured: `─` is 20px in the firmware font; the body container is 576px wide with `paddingLength: 4` → 568px usable. 40 chars = 800px (wraps); the max that fits one line is 28 (560px). We use **26** (520px) for margin and assert the fit with the real measurement library.

**Files:**
- Modify: `glasses-app/package.json` (add devDependency)
- Modify: `glasses-app/src/ui/stream.ts:3`
- Test: `glasses-app/tests/stream.test.ts`

- [ ] **Step 1: Add the measurement library as a devDependency**

Run: `cd glasses-app && npm install -D @evenrealities/pretext`
Expected: `package.json` gains `"@evenrealities/pretext"` under `devDependencies`.

- [ ] **Step 2: Write the failing test**

Add to `glasses-app/tests/stream.test.ts`:

```ts
import { getTextWidth } from "@evenrealities/pretext";

// body container: width 576, paddingLength 4 → 568px usable (see ui/render.ts)
const BODY_INNER_PX = 576 - 2 * 4;

describe("banner divider", () => {
  it("every banner line fits one display line", () => {
    const out = streamToText([{ kind: "banner", text: "model: claude\ncwd: /home/u" }]);
    for (const line of out.split("\n")) {
      expect(getTextWidth(line)).toBeLessThanOrEqual(BODY_INNER_PX);
    }
  });
});
```

(`streamToText` is already imported at the top of `stream.test.ts`; if not, add `import { streamToText } from "../src/ui/stream";`.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd glasses-app && npx vitest run tests/stream.test.ts -t "fits one display line"`
Expected: FAIL — divider line measures 800px, exceeds 568.

- [ ] **Step 4: Write minimal implementation**

In `glasses-app/src/ui/stream.ts`, change line 3:

```ts
// 26 box-drawing chars = 520px; body usable width is 568px (one ─ = 20px,
// measured via @evenrealities/pretext). 40 chars (800px) wrapped to 2 lines.
const RULE = "─".repeat(26);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd glasses-app && npx vitest run tests/stream.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add glasses-app/src/ui/stream.ts glasses-app/tests/stream.test.ts glasses-app/package.json glasses-app/package-lock.json
git commit -m "fix(glasses): shrink banner divider to fit one display line"
```

---

## Task 3: Bug 2 — Stop the recurring Hermes home-channel notice

Two parts: (A) register the platform's `cron_deliver_env_var` so Hermes resolves the home-channel env var cleanly; (B) auto-set `EVEN_G2_HOME_CHANNEL` to the device chat_id on first message, persisting it the same way the gateway's `/sethome` does. Once set, the `not history` + unset-env gate in `gateway/run.py:8767` stops firing.

**Files:**
- Modify: `bridge/src/hermes_evenhub_bridge/__init__.py:16-24`
- Modify: `bridge/src/hermes_evenhub_bridge/adapter.py`
- Test: `bridge/tests/test_register.py`, `bridge/tests/test_adapter_sessions.py`

### Part A — register `cron_deliver_env_var`

- [ ] **Step 1: Write the failing test**

Add to `bridge/tests/test_register.py`:

```python
def test_register_sets_cron_deliver_env_var():
    ctx = FakeCtx()
    pkg.register(ctx)
    assert ctx.platform["cron_deliver_env_var"] == "EVEN_G2_HOME_CHANNEL"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bridge && uv run pytest tests/test_register.py::test_register_sets_cron_deliver_env_var -q`
Expected: FAIL — `KeyError: 'cron_deliver_env_var'`.

- [ ] **Step 3: Write minimal implementation**

In `bridge/src/hermes_evenhub_bridge/__init__.py`, add the kwarg to `register_platform(...)`:

```python
    ctx.register_platform(
        name="even_g2",
        label="Even Realities G2",
        adapter_factory=_factory,
        check_fn=lambda: bool(os.environ.get("EVENHUB_BRIDGE_TOKEN")),
        emoji="👓",
        cron_deliver_env_var="EVEN_G2_HOME_CHANNEL",
        platform_hint=("You are talking to the user through Even Realities G2 "
                       "smart glasses with a tiny display; keep replies short."),
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd bridge && uv run pytest tests/test_register.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bridge/src/hermes_evenhub_bridge/__init__.py bridge/tests/test_register.py
git commit -m "fix(bridge): register cron_deliver_env_var for even_g2 home channel"
```

### Part B — auto-set the home-channel env var on first message

- [ ] **Step 6: Write the failing tests**

Add to `bridge/tests/test_adapter_sessions.py` (the file already imports `json, pytest` and defines `_adapter`; add `import os` at the top if absent):

```python
@pytest.mark.asyncio
async def test_ensure_home_channel_sets_and_persists(tmp_path, monkeypatch):
    monkeypatch.delenv("EVEN_G2_HOME_CHANNEL", raising=False)
    calls = []
    import hermes_cli.config as cfgmod
    monkeypatch.setattr(cfgmod, "save_env_value", lambda k, v: calls.append((k, v)))
    a = _adapter(tmp_path)
    a._ensure_home_channel("g2")
    assert os.environ["EVEN_G2_HOME_CHANNEL"] == "g2"
    assert calls == [("EVEN_G2_HOME_CHANNEL", "g2")]


@pytest.mark.asyncio
async def test_ensure_home_channel_noop_when_already_set(tmp_path, monkeypatch):
    monkeypatch.setenv("EVEN_G2_HOME_CHANNEL", "existing")
    calls = []
    import hermes_cli.config as cfgmod
    monkeypatch.setattr(cfgmod, "save_env_value", lambda k, v: calls.append((k, v)))
    a = _adapter(tmp_path)
    a._ensure_home_channel("g2")
    assert os.environ["EVEN_G2_HOME_CHANNEL"] == "existing"
    assert calls == []
```

(`monkeypatch.delenv`/`setenv` capture the key and restore it on teardown, so the helper's direct `os.environ` write does not leak between tests.)

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd bridge && uv run pytest tests/test_adapter_sessions.py -k ensure_home_channel -q`
Expected: FAIL — `AttributeError: 'EvenG2Adapter' object has no attribute '_ensure_home_channel'`.

- [ ] **Step 8: Write minimal implementation**

In `bridge/src/hermes_evenhub_bridge/adapter.py`, add the helper (place it near `on_text`):

```python
    def _ensure_home_channel(self, chat_id: str) -> None:
        """Set EVEN_G2_HOME_CHANNEL once so Hermes stops prompting to set a home
        channel on every fresh session. Mirrors what the gateway's /sethome does."""
        env_key = "EVEN_G2_HOME_CHANNEL"
        if os.environ.get(env_key):
            return
        os.environ[env_key] = str(chat_id)
        try:
            from hermes_cli.config import save_env_value
            save_env_value(env_key, str(chat_id))
        except Exception as e:  # persistence is best-effort; process env still suppresses it
            log.warning("could not persist %s: %s", env_key, e)
```

Add `import os` to the adapter's imports if it is not already present (it is — see top of file).

Then call it at the start of `on_text`, before `handle_message`:

```python
    async def on_text(self, chat_id: str, text: str) -> None:
        self._ensure_home_channel(chat_id)
        source = self._source_for(chat_id)
        entry = self._session_store.get_or_create_session(source)
        ...
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd bridge && uv run pytest tests/test_adapter_sessions.py -k ensure_home_channel -q`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add bridge/src/hermes_evenhub_bridge/adapter.py bridge/tests/test_adapter_sessions.py
git commit -m "fix(bridge): auto-set EVEN_G2_HOME_CHANNEL to suppress repeat home-channel notice"
```

---

## Task 4: Bug 1 — New session appears in the list

`on_sessions_new` dispatches `/new` but never tells the client. After `/new` resets the active pointer, materialize the fresh session with `get_or_create_session` (the same verified store call `on_text` uses), record it as active, and push the updated list via `on_sessions_list`.

> **Trade-off to confirm in Step 5:** this makes tapping "＋ New session" eagerly persist an (empty, untitled) session even if the user backs out without speaking. That is the direct way to make new sessions show up; if empty-session clutter is unacceptable, the live check is where we'd catch it and reconsider.

**Files:**
- Modify: `bridge/src/hermes_evenhub_bridge/adapter.py:126-127`
- Test: `bridge/tests/test_adapter_sessions.py`

- [ ] **Step 1: Write the failing test**

Add to `bridge/tests/test_adapter_sessions.py`:

```python
@pytest.mark.asyncio
async def test_sessions_new_creates_and_pushes_list(tmp_path, monkeypatch):
    a = _adapter(tmp_path)
    ws = FakeWS(); a._registry.register("g2", ws)

    created = _entry("new1", "", 0, 0)

    class NewStore(FakeStore):
        def get_or_create_session(self, source):
            return created
        def list_sessions(self, active_minutes=None):
            return [created, _entry("old", "Old", 0, 0)]

    a.set_session_store(NewStore())

    async def _noop(chat_id, command):
        pass
    monkeypatch.setattr(a, "_dispatch_command", _noop)

    await a.on_sessions_new("g2")

    assert a._session_by_chat["g2"] == "new1"
    frame = next(m for m in ws.sent if m["t"] == "sessions")
    assert frame["active"] == "new1"
    assert "new1" in [it["id"] for it in frame["items"]]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bridge && uv run pytest tests/test_adapter_sessions.py::test_sessions_new_creates_and_pushes_list -q`
Expected: FAIL — no `sessions` frame is sent and `_session_by_chat["g2"]` is unset (`KeyError`).

- [ ] **Step 3: Write minimal implementation**

In `bridge/src/hermes_evenhub_bridge/adapter.py`, replace `on_sessions_new`:

```python
    async def on_sessions_new(self, chat_id: str) -> None:
        await self._dispatch_command(chat_id, "/new")
        # /new resets the active pointer; materialize the fresh session so it is
        # persisted and visible, mark it active, then push the updated list.
        source = self._source_for(chat_id)
        entry = self._session_store.get_or_create_session(source)
        self._session_by_chat[chat_id] = entry.session_id
        await self.on_sessions_list(chat_id)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd bridge && uv run pytest tests/test_adapter_sessions.py -q`
Expected: PASS (all adapter-sessions tests green).

- [ ] **Step 5: Live-verify the real gateway behavior**

This pins the eager-create trade-off against the real session store. Use the run-bridge and run-glasses-app skills:

1. `cd bridge && hermes gateway restart`, then start the glasses app in the simulator.
2. On the list, tap "＋ New session"; speak/send one message; double-click back to the list.
3. Confirm the new session now appears in the list and is marked active.
4. Tap "＋ New session" again and immediately back out without speaking; confirm whether an empty "(untitled)" row appears. If that clutter is unacceptable, note it for follow-up (a guard that only materializes on first message) — do not block this task on it.

- [ ] **Step 6: Commit**

```bash
git add bridge/src/hermes_evenhub_bridge/adapter.py bridge/tests/test_adapter_sessions.py
git commit -m "fix(bridge): new session materializes and pushes updated list to glasses"
```

---

## Task 5: Bug 5 — Agent messages no longer run together

The dominant cause is Bug 2: the home-channel notice (`send()`) and the real reply (`send()`/`edit_message`) both arrive as `assistant.delta` and coalesce into one stream item (`store.ts` `appendStream`). Task 3 removes that. This task locks the client coalescing behavior with a repro test, then live-verifies; the bridge-side boundary (Step 4+) is **conditional** — implement it only if the live check still shows distinct agent messages running together.

**Files:**
- Test: `glasses-app/tests/store.test.ts`
- (Conditional) Modify: `bridge/src/hermes_evenhub_bridge/adapter.py`

- [ ] **Step 1: Write the characterization test**

Add to `glasses-app/tests/store.test.ts` (it already imports `reduce`, `initialState`, and `StreamItem`/`AppState` types; add any missing import):

```ts
it("consecutive assistant deltas coalesce into one item", () => {
  let s = { ...initialState(), stream: [{ kind: "user", text: "hi" } as StreamItem] };
  s = reduce(s, { t: "assistant.delta", text: "First." });
  s = reduce(s, { t: "assistant.delta", text: "Second." });
  const assistant = s.stream.filter((i) => i.kind === "assistant");
  expect(assistant).toHaveLength(1);
  expect(assistant[0].kind === "assistant" && assistant[0].text).toBe("First.Second.");
});
```

- [ ] **Step 2: Run test to verify it passes (characterization, not a bug)**

Run: `cd glasses-app && npx vitest run tests/store.test.ts -t "coalesce into one item"`
Expected: PASS — documents that the client cannot itself separate distinct server messages; that responsibility is the bridge's.

- [ ] **Step 3: Live-verify after Task 3**

With Task 3 deployed (`hermes gateway restart`), in the simulator: create a new session and send a message. Confirm:
- the reply is **not** prefixed with the "📬 No home channel…" notice, and
- a normal multi-paragraph reply renders with its paragraph breaks intact (newlines survive end-to-end).

If both hold, Bug 5 is resolved — **skip Steps 4–7** and go to Task 6. If distinct agent messages within one turn still run together, do Steps 4–7.

- [ ] **Step 4 (conditional): Write the failing bridge test**

Add to `bridge/tests/test_adapter_stream.py` (matches the existing stream-test harness; use that file's `FakeWS`/`_adapter` helpers):

```python
@pytest.mark.asyncio
async def test_second_message_in_turn_is_separated(tmp_path):
    a = _adapter(tmp_path)
    ws = FakeWS(); a._registry.register("g2", ws)
    a._turn_emitted["g2"] = False
    await a.send("g2", "First message.")
    await a.send("g2", "Second message.")
    deltas = [m["text"] for m in ws.sent if m["t"] == "assistant.delta"]
    assert deltas[0] == "First message."
    assert deltas[1].startswith("\n\n")
```

- [ ] **Step 5 (conditional): Run it to verify it fails**

Run: `cd bridge && uv run pytest tests/test_adapter_stream.py::test_second_message_in_turn_is_separated -q`
Expected: FAIL — second delta has no leading break (and `_turn_emitted` does not exist yet).

- [ ] **Step 6 (conditional): Implement the per-turn message boundary**

In `bridge/src/hermes_evenhub_bridge/adapter.py`:

1. In `__init__`, add: `self._turn_emitted: Dict[str, bool] = {}`
2. Update `send` to separate a subsequent message in the same turn:

```python
    async def send(self, chat_id, content, reply_to=None, metadata=None) -> SendResult:
        state = self._registry.stream_state(chat_id)
        state.reset()
        delta = state.delta_for(content or "")
        if delta:
            if self._turn_emitted.get(chat_id):
                delta = "\n\n" + delta
            await self._registry.send_frame(chat_id, P.assistant_delta(delta))
            self._turn_emitted[chat_id] = True
        return SendResult(success=True, message_id="g2")
```

3. In `edit_message`, after a successful delta send, mark emission: `self._turn_emitted[chat_id] = True`
4. In `on_text`, reset the per-turn flag at turn start (next to the existing `stream_state(chat_id).reset()`): `self._turn_emitted[chat_id] = False`

- [ ] **Step 7 (conditional): Run tests to verify they pass**

Run: `cd bridge && uv run pytest tests/test_adapter_stream.py -q`
Expected: PASS (existing stream tests still green; new test passes).

- [ ] **Step 8: Commit**

```bash
git add glasses-app/tests/store.test.ts
# include the bridge files only if Steps 4–7 were done:
git add bridge/src/hermes_evenhub_bridge/adapter.py bridge/tests/test_adapter_stream.py 2>/dev/null || true
git commit -m "fix(bridge): separate consecutive agent messages; lock client coalescing behavior"
```

---

## Task 6: Full verification

- [ ] **Step 1: Run the whole glasses-app suite**

Run: `cd glasses-app && npm test`
Expected: all test files pass (baseline was 90 tests; new tests added).

- [ ] **Step 2: Run the whole bridge suite**

Run: `cd bridge && uv run pytest -q`
Expected: all pass (baseline was 52; new tests added).

- [ ] **Step 3: Simulator pass for the visual fixes (Bugs 3, 4)**

Use the run-glasses-app skill: launch the simulator, open a session, trigger a banner, and confirm (a) the divider is a single line (Bug 3), and (b) after sending a message the thread auto-scrolls to the newest content and scroll-up/down still works (Bug 4). Capture a 576×288 screenshot.

- [ ] **Step 4: Live gateway pass for the server fixes (Bugs 1, 2)**

`cd bridge && hermes gateway restart`. On the glasses: create a new session, send a message, and confirm (a) no home-channel notice prefixes the reply (Bug 2), and (b) the new session shows in the list on return (Bug 1). Confirm `EVEN_G2_HOME_CHANNEL` is now present in `~/.hermes/.env`.

- [ ] **Step 5: Finish the branch**

Use the superpowers:finishing-a-development-branch skill to choose merge / PR / cleanup.

---

## Self-Review Notes

- **Spec coverage:** Bug 1 → Task 4; Bug 2 → Task 3 (A+B); Bug 3 → Task 2; Bug 4 → Task 1; Bug 5 → Task 5 (repro + conditional boundary). All five covered.
- **Conditional scope:** Task 5 Steps 4–7 are gated on the Step 3 live check, matching the spec's "only if the repro still shows run-together output." Concrete code is provided so the gate is a decision, not a placeholder.
- **Type/name consistency:** `_ensure_home_channel`, `_turn_emitted`, `EVEN_G2_HOME_CHANNEL`, `get_or_create_session`, `on_sessions_list`, `RULE`, `scrollPage` used consistently across tasks and match the existing code read during planning.
