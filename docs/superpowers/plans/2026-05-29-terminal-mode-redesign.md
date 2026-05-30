# Terminal-Mode Interaction Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tap-centric chat UI with a list-first, voice-only, Terminal-style interaction model: boot to a session list, open/create a session, tap-to-record → review transcript → tap-to-send, watch a terminal-style stream (`>` you, `/` tools, plain assistant) with an agent-state bar.

**Architecture:** A pure four-state machine on the glasses (`list → idle → recording → transcribing → review → idle`). Socket events fold into an ordered `stream` via `reduce`; gestures fold into `{state, effects}` via a pure `dispatch`; `main.ts` is a thin executor of effects and page transitions. One bridge change decouples transcription from turn-execution so review/redo is possible.

**Tech Stack:** TypeScript + Vite + `@evenrealities/even_hub_sdk@0.0.10` (glasses), vitest (TS tests); Python + websockets + faster-whisper (bridge), pytest.

**Spec:** `docs/superpowers/specs/2026-05-29-terminal-mode-redesign-design.md`

---

## File Structure

**Glasses (`src/`):**
- `state/store.ts` — **rewrite.** New `AppState` (screen/phase/stream/pending/turn), `initialState`, `reduce` (socket), `barText`, `connDot`. Drops `View`/`ChatState`/`selectSessionId`/`setView`.
- `input/dispatch.ts` — **new.** Pure `dispatch(state, gesture, index?) → {state, effects}`; `Gesture`/`Effect` types.
- `ui/stream.ts` — **new.** Pure `streamToText(items, maxChars?)`.
- `ui/render.ts` — **modify.** Add `createListStartup`, `showListPage` (replaces `buildSessionsPage`), `showSessionPage` (renames `showChatPage`); drop `buildChatPage`. Keep `setText`, `IDS`, `NAMES`.
- `ui/views.ts` — **rewrite.** `renderList`, `renderSession`, `listRows`, `truncateRow`. Drops `renderChat`/`renderSessions`.
- `main.ts` — **rewrite.** Boot to list; execute dispatch effects; rebuild page on screen change; request `sessions.list` on `hello.ok`; lifecycle (foreground = flush, system/abnormal exit = teardown).
- `protocol.ts` — **modify.** Add `assistant.delta` to `ServerMsg` + `SERVER_TYPES`.
- `input/router.ts` — **unchanged** (already normalizes proto3-omitted clicks).
- `audio/capture.ts`, `net/ws-client.ts`, `util/coalesce.ts`, `storage/persist.ts`, `config.ts` — **unchanged.**

**Bridge (`hermes-evenhub-bridge/`):**
- `src/hermes_evenhub_bridge/server.py` — **modify.** `audio.stop` emits `transcript` only (remove auto-run); `_run` streams **incremental deltas** (`assistant.delta`) instead of cumulative `acc`.
- `src/hermes_evenhub_bridge/protocol.py` — **modify.** Add `assistant_delta(text)` builder.

**Tests:**
- `tests/store.test.ts` — **rewrite** for the new model.
- `tests/dispatch.test.ts`, `tests/stream.test.ts` — **new.**
- `tests/render.test.ts` — **modify.**
- `tests/store.sessions.test.ts` — **delete** (helpers removed).
- bridge `tests/test_server.py` — **add** decouple test.

---

## Task 1: Store — types, initialState, reduce skeleton

**Files:**
- Modify: `src/state/store.ts`
- Test: `tests/store.test.ts` (rewrite)

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `tests/store.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { initialState, reduce, type AppState } from "../src/state/store";

describe("initialState", () => {
  it("boots on the session list, idle, empty stream", () => {
    const s = initialState();
    expect(s.screen).toBe("list");
    expect(s.phase).toBe("idle");
    expect(s.stream).toEqual([]);
    expect(s.pending).toBeNull();
    expect(s.turn).toBe("idle");
    expect(s.sessions).toEqual({ items: [], active: null });
  });
});

describe("reduce: sessions", () => {
  it("sets items and active from a sessions message", () => {
    const s: AppState = initialState();
    const next = reduce(s, { t: "sessions", items: [{ id: "a", title: "A", updated: 1 }], active: "a" });
    expect(next.sessions.items).toHaveLength(1);
    expect(next.sessions.active).toBe("a");
  });
  it("sets active from hello.ok and active messages", () => {
    let s = reduce(initialState(), { t: "hello.ok", caps: {}, active: "x" });
    expect(s.sessions.active).toBe("x");
    s = reduce(s, { t: "active", id: "y" });
    expect(s.sessions.active).toBe("y");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store.test.ts`
Expected: FAIL — `initialState` returns the old shape (`screen` undefined).

- [ ] **Step 3: Write minimal implementation**

Replace the entire contents of `src/state/store.ts` with:

```ts
import type { ServerMsg, SessionItem } from "../protocol";

export type Screen = "list" | "session";
export type Phase = "idle" | "recording" | "transcribing" | "review";
export type Turn = "idle" | "thinking" | "working";

export type StreamItem =
  | { kind: "user"; text: string }
  | { kind: "tool"; name: string; running: boolean; ok?: boolean }
  | { kind: "assistant"; text: string };

export interface AppState {
  screen: Screen;
  phase: Phase;
  conn: string;
  sessions: { items: SessionItem[]; active: string | null };
  stream: StreamItem[];
  pending: { transcript: string } | null;
  turn: Turn;
}

export function initialState(): AppState {
  return {
    screen: "list",
    phase: "idle",
    conn: "connecting",
    sessions: { items: [], active: null },
    stream: [],
    pending: null,
    turn: "idle",
  };
}

export function reduce(s: AppState, m: ServerMsg): AppState {
  switch (m.t) {
    case "hello.ok":
      return { ...s, sessions: { ...s.sessions, active: m.active } };
    case "sessions":
      return { ...s, sessions: { items: m.items, active: m.active } };
    case "active":
      return { ...s, sessions: { ...s.sessions, active: m.id } };
    case "error":
      return { ...s, conn: `error: ${m.msg}` };
    default:
      return s;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/state/store.ts tests/store.test.ts
git commit -m "feat(store): new state machine types + initialState + sessions reduce"
```

---

## Task 2: Store — stream reduce (assistant deltas + tools + turn.done)

**Files:**
- Modify: `src/protocol.ts`
- Modify: `src/state/store.ts`
- Test: `tests/store.test.ts`

> Note: assistant text streams as **incremental deltas** (`assistant.delta`). Each delta
> appends to the trailing assistant segment; a `tool.start` closes the current segment,
> so the next delta opens a fresh one — this is what keeps prose and tool lines correctly
> interleaved in the terminal stream.

- [ ] **Step 1: Extend the protocol**

In `src/protocol.ts`, add the `assistant.delta` variant to the `ServerMsg` union (next to `assistant`):

```ts
  | { t: "assistant.delta"; text: string }
```

and add `"assistant.delta"` to the `SERVER_TYPES` set.

- [ ] **Step 2: Write the failing test**

Append to `tests/store.test.ts`:

```ts
describe("reduce: stream", () => {
  it("appends assistant deltas to the trailing segment", () => {
    let s = initialState();
    s = reduce(s, { t: "assistant.delta", text: "It's" });
    s = reduce(s, { t: "assistant.delta", text: " Friday" });
    expect(s.stream).toEqual([{ kind: "assistant", text: "It's Friday" }]);
  });
  it("a delta after a tool opens a NEW segment (no duplication across tools)", () => {
    let s = initialState();
    s = reduce(s, { t: "assistant.delta", text: "Checking…" });
    s = reduce(s, { t: "tool.start", name: "terminal" });
    s = reduce(s, { t: "tool.end", name: "terminal", ok: true });
    s = reduce(s, { t: "assistant.delta", text: "Done." });
    expect(s.stream).toEqual([
      { kind: "assistant", text: "Checking…" },
      { kind: "tool", name: "terminal", running: false, ok: true },
      { kind: "assistant", text: "Done." },
    ]);
  });
  it("pushes a running tool on tool.start and sets turn=working", () => {
    let s = reduce(initialState(), { t: "tool.start", name: "terminal" });
    expect(s.turn).toBe("working");
    expect(s.stream).toEqual([{ kind: "tool", name: "terminal", running: true }]);
  });
  it("patches the matching running tool to done on tool.end", () => {
    let s = initialState();
    s = reduce(s, { t: "tool.start", name: "terminal" });
    s = reduce(s, { t: "tool.end", name: "terminal", ok: true });
    expect(s.stream).toEqual([{ kind: "tool", name: "terminal", running: false, ok: true }]);
  });
  it("sets turn=idle on turn.done", () => {
    let s = reduce(initialState(), { t: "tool.start", name: "x" });
    s = reduce(s, { t: "turn.done" });
    expect(s.turn).toBe("idle");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/store.test.ts`
Expected: FAIL — assistant.delta/tool cases unhandled (default returns `s`).

- [ ] **Step 4: Write minimal implementation**

In `src/state/store.ts`, add these helpers above `reduce`:

```ts
function appendDelta(stream: StreamItem[], delta: string): StreamItem[] {
  const last = stream[stream.length - 1];
  if (last && last.kind === "assistant") {
    return [...stream.slice(0, -1), { kind: "assistant", text: last.text + delta }];
  }
  return [...stream, { kind: "assistant", text: delta }];
}

function patchTool(stream: StreamItem[], name: string, ok: boolean): StreamItem[] {
  for (let i = stream.length - 1; i >= 0; i--) {
    const it = stream[i];
    if (it.kind === "tool" && it.running && it.name === name) {
      const patched: StreamItem = { kind: "tool", name: it.name, running: false, ok };
      return [...stream.slice(0, i), patched, ...stream.slice(i + 1)];
    }
  }
  return stream;
}
```

Then add these cases to the `switch` in `reduce` (before `default`):

```ts
    case "assistant.delta":
      return { ...s, stream: appendDelta(s.stream, m.text) };
    case "tool.start":
      return { ...s, stream: [...s.stream, { kind: "tool", name: m.name, running: true }], turn: "working" };
    case "tool.end":
      return { ...s, stream: patchTool(s.stream, m.name, m.ok) };
    case "turn.done":
      return { ...s, turn: "idle" };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/store.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/protocol.ts src/state/store.ts tests/store.test.ts
git commit -m "feat(store): fold socket stream events (assistant deltas/tool/turn.done)"
```

---

## Task 3: Store — transcript guard

**Files:**
- Modify: `src/state/store.ts`
- Test: `tests/store.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/store.test.ts`:

```ts
describe("reduce: transcript guard", () => {
  it("sets pending + review only when phase is transcribing", () => {
    const s = { ...initialState(), screen: "session" as const, phase: "transcribing" as const };
    const next = reduce(s, { t: "transcript", text: "add dark mode" });
    expect(next.pending).toEqual({ transcript: "add dark mode" });
    expect(next.phase).toBe("review");
  });
  it("ignores a transcript that arrives in any other phase (cancel path)", () => {
    const s = { ...initialState(), screen: "session" as const, phase: "idle" as const };
    const next = reduce(s, { t: "transcript", text: "stale" });
    expect(next.pending).toBeNull();
    expect(next.phase).toBe("idle");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store.test.ts`
Expected: FAIL — transcript unhandled.

- [ ] **Step 3: Write minimal implementation**

Add to the `switch` in `reduce` (before `default`):

```ts
    case "transcript":
      return s.phase === "transcribing"
        ? { ...s, pending: { transcript: m.text }, phase: "review" }
        : s;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/state/store.ts tests/store.test.ts
git commit -m "feat(store): transcript guarded to transcribing phase (drops cancel leftovers)"
```

---

## Task 4: Store — barText + connDot

**Files:**
- Modify: `src/state/store.ts`
- Test: `tests/store.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/store.test.ts`:

```ts
import { barText, connDot } from "../src/state/store";

describe("barText", () => {
  const base = { ...initialState(), screen: "session" as const };
  it("recording / transcribing / review", () => {
    expect(barText({ ...base, phase: "recording" })).toBe("🎤 recording…");
    expect(barText({ ...base, phase: "transcribing" })).toBe("transcribing…");
    expect(barText({ ...base, phase: "review" })).toBe("tap = send · swipe↓ = redo");
  });
  it("idle reflects the turn state", () => {
    expect(barText({ ...base, phase: "idle", turn: "idle" })).toBe("ready for input");
    expect(barText({ ...base, phase: "idle", turn: "thinking" })).toBe("thinking…");
  });
  it("working names the active tool", () => {
    const s = { ...base, phase: "idle" as const, turn: "working" as const,
      stream: [{ kind: "tool" as const, name: "terminal", running: true }] };
    expect(barText(s)).toBe("working… (terminal)");
  });
});

describe("connDot", () => {
  it("filled when connected, hollow otherwise", () => {
    expect(connDot("connected")).toBe("●");
    expect(connDot("reconnecting")).toBe("◌");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store.test.ts`
Expected: FAIL — `barText`/`connDot` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/state/store.ts`:

```ts
export function barText(s: AppState): string {
  switch (s.phase) {
    case "recording": return "🎤 recording…";
    case "transcribing": return "transcribing…";
    case "review": return "tap = send · swipe↓ = redo";
    case "idle":
    default: {
      if (s.turn === "working") {
        for (let i = s.stream.length - 1; i >= 0; i--) {
          const it = s.stream[i];
          if (it.kind === "tool" && it.running) return `working… (${it.name})`;
        }
        return "working…";
      }
      return s.turn === "thinking" ? "thinking…" : "ready for input";
    }
  }
}

export function connDot(conn: string): string {
  return conn === "connected" ? "●" : "◌";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/state/store.ts tests/store.test.ts
git commit -m "feat(store): agent-state bar text + connection dot"
```

---

## Task 5: Dispatch — list screen gestures

**Files:**
- Create: `src/input/dispatch.ts`
- Test: `tests/dispatch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/dispatch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dispatch } from "../src/input/dispatch";
import { initialState, type AppState } from "../src/state/store";
import { sessionsNew, sessionsSwitch } from "../src/protocol";

function listWith(items: { id: string; title: string }[]): AppState {
  return { ...initialState(), sessions: { items: items.map((i) => ({ ...i, updated: 0 })), active: null } };
}

describe("dispatch: list", () => {
  it("index 0 (or undefined) creates + opens a new session", () => {
    const r = dispatch(listWith([{ id: "a", title: "A" }]), "click", undefined);
    expect(r.state.screen).toBe("session");
    expect(r.state.phase).toBe("idle");
    expect(r.state.stream).toEqual([]);
    expect(r.effects).toEqual([{ kind: "send", frame: sessionsNew() }]);
  });
  it("index 1 opens the first existing session", () => {
    const r = dispatch(listWith([{ id: "a", title: "A" }, { id: "b", title: "B" }]), "click", 1);
    expect(r.state.screen).toBe("session");
    expect(r.state.sessions.active).toBe("a");
    expect(r.effects).toEqual([{ kind: "send", frame: sessionsSwitch("a") }]);
  });
  it("double-press exits the app", () => {
    const r = dispatch(listWith([]), "doubleClick");
    expect(r.effects).toEqual([{ kind: "exit" }]);
    expect(r.state.screen).toBe("list");
  });
  it("scroll is a no-op on the list", () => {
    const r = dispatch(listWith([{ id: "a", title: "A" }]), "scrollUp");
    expect(r.effects).toEqual([]);
    expect(r.state.screen).toBe("list");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dispatch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/input/dispatch.ts`:

```ts
import type { AppState } from "../state/store";
import { sessionsNew, sessionsSwitch } from "../protocol";

export type Gesture = "click" | "doubleClick" | "scrollUp" | "scrollDown";

export type Effect =
  | { kind: "send"; frame: string }
  | { kind: "startMic" }
  | { kind: "stopMic" }
  | { kind: "exit" };

export interface DispatchResult { state: AppState; effects: Effect[]; }

const enterSession = (s: AppState, active: string | null): AppState => ({
  ...s, screen: "session", phase: "idle", stream: [], pending: null, turn: "idle",
  sessions: { ...s.sessions, active },
});

export function dispatch(s: AppState, g: Gesture, index?: number): DispatchResult {
  if (s.screen === "list") {
    if (g === "click") {
      const i = index ?? 0; // proto3 omits index 0 → undefined means the ＋New row
      if (i === 0) return { state: enterSession(s, null), effects: [{ kind: "send", frame: sessionsNew() }] };
      const item = s.sessions.items[i - 1];
      if (!item) return { state: s, effects: [] };
      return { state: enterSession(s, item.id), effects: [{ kind: "send", frame: sessionsSwitch(item.id) }] };
    }
    if (g === "doubleClick") return { state: s, effects: [{ kind: "exit" }] };
    return { state: s, effects: [] };
  }
  return { state: s, effects: [] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/dispatch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/input/dispatch.ts tests/dispatch.test.ts
git commit -m "feat(dispatch): list-screen gestures (open/new/exit)"
```

---

## Task 6: Dispatch — session idle + recording

**Files:**
- Modify: `src/input/dispatch.ts`
- Test: `tests/dispatch.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/dispatch.test.ts`:

```ts
function session(phase: AppState["phase"]): AppState {
  return { ...initialState(), screen: "session", phase };
}

describe("dispatch: session idle", () => {
  it("tap starts recording", () => {
    const r = dispatch(session("idle"), "click");
    expect(r.state.phase).toBe("recording");
    expect(r.effects).toEqual([{ kind: "startMic" }]);
  });
  it("double-press returns to the list", () => {
    const r = dispatch(session("idle"), "doubleClick");
    expect(r.state.screen).toBe("list");
    expect(r.effects).toEqual([]);
  });
});

describe("dispatch: session recording", () => {
  it("tap stops + moves to transcribing", () => {
    const r = dispatch(session("recording"), "click");
    expect(r.state.phase).toBe("transcribing");
    expect(r.effects).toEqual([{ kind: "stopMic" }]);
  });
  it("double-press cancels back to idle (still stops the mic)", () => {
    const r = dispatch(session("recording"), "doubleClick");
    expect(r.state.phase).toBe("idle");
    expect(r.effects).toEqual([{ kind: "stopMic" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dispatch.test.ts`
Expected: FAIL — session branch returns no-op.

- [ ] **Step 3: Write minimal implementation**

In `src/input/dispatch.ts`, replace the final `return { state: s, effects: [] };` (the session fall-through) with:

```ts
  // screen === "session"
  if (s.phase === "idle") {
    if (g === "click") return { state: { ...s, phase: "recording" }, effects: [{ kind: "startMic" }] };
    if (g === "doubleClick") return { state: { ...s, screen: "list", phase: "idle", pending: null }, effects: [] };
    return { state: s, effects: [] };
  }
  if (s.phase === "recording") {
    if (g === "click") return { state: { ...s, phase: "transcribing" }, effects: [{ kind: "stopMic" }] };
    if (g === "doubleClick") return { state: { ...s, phase: "idle" }, effects: [{ kind: "stopMic" }] };
    return { state: s, effects: [] };
  }
  return { state: s, effects: [] };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/dispatch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/input/dispatch.ts tests/dispatch.test.ts
git commit -m "feat(dispatch): session idle + recording gestures"
```

---

## Task 7: Dispatch — review (confirm / redo / back)

**Files:**
- Modify: `src/input/dispatch.ts`
- Test: `tests/dispatch.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/dispatch.test.ts`:

```ts
import { textMsg } from "../src/protocol";

function review(transcript: string): AppState {
  return { ...initialState(), screen: "session", phase: "review", pending: { transcript } };
}

describe("dispatch: session review", () => {
  it("tap sends: pushes a user item, clears pending, thinks", () => {
    const r = dispatch(review("add dark mode"), "click");
    expect(r.state.stream).toEqual([{ kind: "user", text: "add dark mode" }]);
    expect(r.state.pending).toBeNull();
    expect(r.state.phase).toBe("idle");
    expect(r.state.turn).toBe("thinking");
    expect(r.effects).toEqual([{ kind: "send", frame: textMsg("add dark mode") }]);
  });
  it("swipe-down redoes: clears pending, no send, stream untouched", () => {
    const r = dispatch(review("oops"), "scrollDown");
    expect(r.state.pending).toBeNull();
    expect(r.state.phase).toBe("idle");
    expect(r.state.stream).toEqual([]);
    expect(r.effects).toEqual([]);
  });
  it("double-press discards and returns to the list", () => {
    const r = dispatch(review("oops"), "doubleClick");
    expect(r.state.screen).toBe("list");
    expect(r.state.pending).toBeNull();
    expect(r.effects).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dispatch.test.ts`
Expected: FAIL — review phase returns no-op.

- [ ] **Step 3: Write minimal implementation**

In `src/input/dispatch.ts`, add `import { sessionsNew, sessionsSwitch, textMsg } from "../protocol";` (extend the existing import), then insert before the final `return { state: s, effects: [] };`:

```ts
  if (s.phase === "review") {
    if (g === "click" && s.pending) {
      const text = s.pending.transcript;
      return {
        state: { ...s, stream: [...s.stream, { kind: "user", text }], pending: null, phase: "idle", turn: "thinking" },
        effects: [{ kind: "send", frame: textMsg(text) }],
      };
    }
    if (g === "scrollDown") return { state: { ...s, pending: null, phase: "idle" }, effects: [] };
    if (g === "doubleClick") return { state: { ...s, screen: "list", phase: "idle", pending: null }, effects: [] };
    return { state: s, effects: [] };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/dispatch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/input/dispatch.ts tests/dispatch.test.ts
git commit -m "feat(dispatch): review gestures (confirm/redo/back)"
```

---

## Task 8: Stream serializer

**Files:**
- Create: `src/ui/stream.ts`
- Test: `tests/stream.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/stream.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { streamToText } from "../src/ui/stream";
import type { StreamItem } from "../src/state/store";

describe("streamToText", () => {
  it("prefixes: > user, / tool (running vs done), plain assistant", () => {
    const items: StreamItem[] = [
      { kind: "user", text: "add dark mode" },
      { kind: "tool", name: "terminal", running: false, ok: true },
      { kind: "assistant", text: "Added it." },
      { kind: "tool", name: "grep", running: true },
    ];
    expect(streamToText(items)).toBe("> add dark mode\n/ terminal ✓\nAdded it.\n/ grep");
  });
  it("marks a failed tool with ✗", () => {
    expect(streamToText([{ kind: "tool", name: "x", running: false, ok: false }])).toBe("/ x ✗");
  });
  it("returns empty string for an empty stream", () => {
    expect(streamToText([])).toBe("");
  });
  it("keeps the tail when over maxChars", () => {
    const items: StreamItem[] = [{ kind: "assistant", text: "abcdefghij" }];
    expect(streamToText(items, 5)).toBe("…ghij");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stream.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/ui/stream.ts`:

```ts
import type { StreamItem } from "../state/store";

export function streamToText(items: StreamItem[], maxChars = 400): string {
  const lines = items.map((it) => {
    if (it.kind === "user") return `> ${it.text}`;
    if (it.kind === "tool") return `/ ${it.name}${it.running ? "" : it.ok === false ? " ✗" : " ✓"}`;
    return it.text;
  });
  const text = lines.join("\n");
  if (text.length <= maxChars) return text;
  return "…" + text.slice(text.length - (maxChars - 1));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stream.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/stream.ts tests/stream.test.ts
git commit -m "feat(ui): terminal-style stream serializer"
```

---

## Task 9: Render — list startup + list/session page builders

**Files:**
- Modify: `src/ui/render.ts`
- Test: `tests/render.test.ts` (rewrite)

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `tests/render.test.ts` with:

```ts
import { describe, it, expect, vi } from "vitest";
import { setText, IDS, createListStartup, showListPage, showSessionPage } from "../src/ui/render";

function fakeBridge() {
  return {
    createStartUpPageContainer: vi.fn(async () => {}),
    rebuildPageContainer: vi.fn(async () => {}),
    textContainerUpgrade: vi.fn(async () => {}),
  } as any;
}

describe("setText", () => {
  it("full-replaces with the container name", async () => {
    const b = fakeBridge();
    await setText(b, IDS.status, "x");
    const arg = b.textContainerUpgrade.mock.calls[0][0];
    expect(arg.containerName).toBe("status");
    expect(arg.contentOffset).toBe(0);
    expect(arg.contentLength).toBe(0);
    expect(arg.content).toBe("x");
  });
});

describe("list pages", () => {
  it("createListStartup builds a one-shot list page with the given rows", async () => {
    const b = fakeBridge();
    await createListStartup(b, ["＋ New session", "A"]);
    const arg = b.createStartUpPageContainer.mock.calls[0][0];
    expect(arg.listObject[0].itemContainer.itemName).toEqual(["＋ New session", "A"]);
  });
  it("showListPage rebuilds the list page with the rows", async () => {
    const b = fakeBridge();
    await showListPage(b, ["＋ New session"]);
    const arg = b.rebuildPageContainer.mock.calls[0][0];
    expect(arg.listObject[0].itemContainer.itemName).toEqual(["＋ New session"]);
  });
});

describe("session page", () => {
  it("showSessionPage rebuilds three text containers", async () => {
    const b = fakeBridge();
    await showSessionPage(b);
    const arg = b.rebuildPageContainer.mock.calls[0][0];
    expect(arg.containerTotalNum).toBe(3);
    expect(arg.textObject).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render.test.ts`
Expected: FAIL — `createListStartup`/`showListPage`/`showSessionPage` not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/ui/render.ts`: keep `IDS`, `NAMES`, `chatTextObjects`, and `setText`. Rename `showChatPage` → `showSessionPage`, delete `buildChatPage`, and replace `buildSessionsPage` with the two list functions below. Final list/session/builder section:

```ts
// Session page: the three text containers (header / body / status), reused for
// every session render. createStartUpPageContainer is one-shot, so re-entering a
// session uses rebuildPageContainer; renderSession() then fills content in-place.
export async function showSessionPage(bridge: EvenAppBridge): Promise<void> {
  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 3,
    textObject: chatTextObjects(),
  }));
}

function listContainer(rows: string[]): ListContainerProperty[] {
  const items = rows.slice(0, 20);
  return [
    new ListContainerProperty({
      containerID: IDS.list, containerName: "list",
      xPosition: 0, yPosition: 0, width: 576, height: 288,
      isEventCapture: 1,
      itemContainer: new ListItemContainerProperty({
        itemCount: Math.max(1, items.length),
        itemWidth: 0,
        isItemSelectBorderEn: 1,
        itemName: items.length ? items : ["No sessions"],
      }),
    }),
  ];
}

// Boot lands on the list, so the one-shot startup page IS the list.
export async function createListStartup(bridge: EvenAppBridge, rows: string[]): Promise<void> {
  await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
    containerTotalNum: 1,
    listObject: listContainer(rows),
  }));
}

export async function showListPage(bridge: EvenAppBridge, rows: string[]): Promise<void> {
  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 1,
    listObject: listContainer(rows),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/render.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/render.ts tests/render.test.ts
git commit -m "feat(ui): list startup/rebuild pages + session page builder"
```

---

## Task 10: Views — renderList, renderSession, listRows

**Files:**
- Modify: `src/ui/views.ts` (rewrite)
- Test: `tests/views.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/views.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { listRows, renderSession } from "../src/ui/views";
import { initialState, type AppState } from "../src/state/store";

describe("listRows", () => {
  it("prepends the ＋New row before truncated titles", () => {
    const s: AppState = { ...initialState(), sessions: { items: [{ id: "a", title: "build the app", updated: 0 }], active: "a" } };
    expect(listRows(s)).toEqual(["＋ New session", "build the app"]);
  });
});

describe("renderSession", () => {
  it("fills header (title+dot), body (stream), status (bar)", async () => {
    const calls: Record<number, string> = {};
    const bridge = {
      textContainerUpgrade: vi.fn(async (u: any) => { calls[u.containerID] = u.content; }),
    } as any;
    const s: AppState = {
      ...initialState(), screen: "session", phase: "idle", conn: "connected", turn: "idle",
      sessions: { items: [{ id: "a", title: "build the app", updated: 0 }], active: "a" },
      stream: [{ kind: "user", text: "hi" }],
    };
    await renderSession(bridge, s);
    expect(calls[1]).toBe("build the app  ●");   // IDS.header
    expect(calls[2]).toBe("> hi");                // IDS.body
    expect(calls[3]).toBe("ready for input");     // IDS.status
  });
  it("shows the pending transcript in the body during review", async () => {
    const calls: Record<number, string> = {};
    const bridge = { textContainerUpgrade: vi.fn(async (u: any) => { calls[u.containerID] = u.content; }) } as any;
    const s: AppState = { ...initialState(), screen: "session", phase: "review", conn: "connected",
      sessions: { items: [{ id: "a", title: "A", updated: 0 }], active: "a" }, pending: { transcript: "add dark mode" } };
    await renderSession(bridge, s);
    expect(calls[2]).toBe('"add dark mode"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/views.test.ts`
Expected: FAIL — module exports missing.

- [ ] **Step 3: Write minimal implementation**

Replace the entire contents of `src/ui/views.ts` with:

```ts
import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import type { AppState } from "../state/store";
import { barText, connDot } from "../state/store";
import { IDS, setText, showListPage } from "./render";
import { streamToText } from "./stream";

const ROW_CHARS = 48;

export function truncateRow(title: string): string {
  const t = title.trim() || "(untitled)";
  return t.length <= ROW_CHARS ? t : t.slice(0, ROW_CHARS - 1) + "…";
}

export function listRows(s: AppState): string[] {
  return ["＋ New session", ...s.sessions.items.map((i) => truncateRow(i.title))];
}

export async function renderList(bridge: EvenAppBridge, s: AppState): Promise<void> {
  // Lists can't update in place — rebuild the page (glasses-ui).
  await showListPage(bridge, listRows(s));
}

export async function renderSession(bridge: EvenAppBridge, s: AppState): Promise<void> {
  const active = s.sessions.items.find((i) => i.id === s.sessions.active);
  const title = active ? truncateRow(active.title) : "Hermes";
  await setText(bridge, IDS.header, `${title}  ${connDot(s.conn)}`);

  const body =
    s.phase === "review" && s.pending
      ? `"${s.pending.transcript}"`
      : streamToText(s.stream) || "tap to speak";
  await setText(bridge, IDS.body, body);

  await setText(bridge, IDS.status, barText(s));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/views.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/views.ts tests/views.test.ts
git commit -m "feat(ui): renderList + renderSession (terminal layout)"
```

---

## Task 11: main.ts — boot to list, dispatch executor, page transitions, lifecycle

**Files:**
- Modify: `src/main.ts` (rewrite)
- Test: manual (simulator) — no unit test; logic lives in the pure modules already tested.

- [ ] **Step 1: Rewrite `src/main.ts`**

Replace the entire contents of `src/main.ts` with:

```ts
import { waitForEvenAppBridge, OsEventTypeList } from "@evenrealities/even_hub_sdk";
import { loadConfig } from "./config";
import { BridgeClient } from "./net/ws-client";
import { initialState, reduce, type AppState } from "./state/store";
import { createListStartup, showListPage, showSessionPage } from "./ui/render";
import { renderList, renderSession, listRows } from "./ui/views";
import { routeEvent } from "./input/router";
import { dispatch, type Gesture, type Effect } from "./input/dispatch";
import { sessionsList } from "./protocol";
import { serializeLatest } from "./util/coalesce";
import { createCapture } from "./audio/capture";
import { saveConnectionState, loadConnectionState } from "./storage/persist";

async function boot(): Promise<void> {
  const bridge = await waitForEvenAppBridge();
  let state: AppState = initialState();
  await createListStartup(bridge, listRows(state)); // one-shot startup = the list

  const cfg = loadConfig();
  const persisted = await loadConnectionState(bridge);
  const urls = persisted.url
    ? [persisted.url, cfg.lanUrl, cfg.remoteUrl].filter(Boolean)
    : [cfg.lanUrl, cfg.remoteUrl];

  const scheduleRender = serializeLatest((s: AppState) =>
    s.screen === "list" ? renderList(bridge, s) : renderSession(bridge, s));

  let currentUrl = urls[0] ?? "";
  const client = new BridgeClient(
    { urls, token: cfg.token },
    {
      onMessage: (m) => {
        state = reduce(state, m);
        scheduleRender(state);
        if (m.t === "hello.ok") {
          client.send(sessionsList()); // populate the list once connected
          void saveConnectionState(bridge, currentUrl, m.active ?? "");
        }
        if (m.t === "active") void saveConnectionState(bridge, currentUrl, m.id);
      },
      onStatus: (s) => { state = { ...state, conn: s }; scheduleRender(state); },
    },
  );
  client.connect();

  const capture = createCapture(bridge, client);

  function runEffect(e: Effect): void {
    if (e.kind === "send") client.send(e.frame);
    else if (e.kind === "startMic") void capture.start();
    else if (e.kind === "stopMic") void capture.stop();
    else if (e.kind === "exit") bridge.shutDownPageContainer(1);
  }

  async function applyGesture(g: Gesture, index?: number): Promise<void> {
    const prevScreen = state.screen;
    const r = dispatch(state, g, index);
    state = r.state;
    for (const e of r.effects) runEffect(e);
    if (state.screen !== prevScreen) {
      // Page kind changed — rebuild before filling content.
      if (state.screen === "list") await showListPage(bridge, listRows(state));
      else await showSessionPage(bridge);
    }
    scheduleRender(state);
  }

  // Full teardown only on real exit (system/abnormal), per handle-input skill.
  let torn = false;
  function teardown(): void {
    if (torn) return;
    torn = true;
    off();
    void capture.stop();
    client.close();
  }

  const off = bridge.onEvenHubEvent((e) => {
    capture.handleEvent(e);
    const et = e.sysEvent?.eventType ?? e.listEvent?.eventType ?? e.textEvent?.eventType;
    // Lifecycle: background = flush only; system/abnormal exit = teardown.
    if (et === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
      void saveConnectionState(bridge, currentUrl, state.sessions.active ?? "");
      return;
    }
    if (et === OsEventTypeList.SYSTEM_EXIT_EVENT || et === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
      teardown();
      return;
    }
    routeEvent(e, {
      onClick: (index) => { void applyGesture("click", index); },
      onDoubleClick: () => { void applyGesture("doubleClick"); },
      onScrollUp: () => { void applyGesture("scrollUp"); },
      onScrollDown: () => { void applyGesture("scrollDown"); },
    });
  });

  window.addEventListener("beforeunload", teardown);
  console.log("[glasses] ready");
}

boot().catch((err) => console.error("[glasses] boot failed", err));
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run build`
Expected: PASS, no TS errors.

- [ ] **Step 3: Full unit suite**

Run: `npm test`
Expected: PASS (store, dispatch, stream, render, views, router, coalesce, ws-client, persist).

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat(main): list-first boot, dispatch executor, lifecycle refinement"
```

---

## Task 12: Remove obsolete sessions test

**Files:**
- Delete: `tests/store.sessions.test.ts`

- [ ] **Step 1: Confirm it references removed helpers**

Run: `grep -n "selectSessionId\|setView" tests/store.sessions.test.ts`
Expected: matches (these helpers no longer exist).

- [ ] **Step 2: Delete and re-run the suite**

```bash
git rm tests/store.sessions.test.ts
npm test
```
Expected: PASS, no references to `selectSessionId`/`setView` remain (grep `src` returns nothing).

- [ ] **Step 3: Commit**

```bash
git commit -m "test: drop obsolete store.sessions suite (helpers removed in redesign)"
```

---

## Task 13: Bridge — decouple transcription from turn + stream incremental deltas

**Files:**
- Modify: `hermes-evenhub-bridge/src/hermes_evenhub_bridge/server.py` (`audio.stop` branch + `_run`)
- Modify: `hermes-evenhub-bridge/src/hermes_evenhub_bridge/protocol.py` (add `assistant_delta`)
- Test: `hermes-evenhub-bridge/tests/test_server.py`

- [ ] **Step 1: Write the failing test**

Add to `hermes-evenhub-bridge/tests/test_server.py` (match the existing fixture/style in that file; the example below assumes a `BridgeServer` with an injected fake hermes + transcriber and a fake `ws` exposing `.sent`):

```python
import json
import pytest
from hermes_evenhub_bridge.server import BridgeServer
from hermes_evenhub_bridge.config import BridgeConfig


class FakeWS:
    def __init__(self, frames):
        self._frames = list(frames)
        self.sent = []
    def __aiter__(self):
        return self
    async def __anext__(self):
        if not self._frames:
            raise StopAsyncIteration
        return self._frames.pop(0)
    async def send(self, raw):
        self.sent.append(raw)


class FakeHermes:
    def __init__(self):
        self.turns = []
    async def run_turn(self, session_id, text):
        self.turns.append((session_id, text))
        if False:
            yield None  # make it an async generator


class FakeTranscriber:
    def transcribe(self, pcm):
        return "hello world"


@pytest.mark.asyncio
async def test_audio_stop_emits_transcript_without_running_a_turn():
    cfg = BridgeConfig(token="t", port=0)
    hermes = FakeHermes()
    srv = BridgeServer(cfg, hermes=hermes, transcriber=FakeTranscriber())
    ws = FakeWS([
        json.dumps({"t": "hello", "token": "t", "device": "x"}),
        json.dumps({"t": "audio.start"}),
        b"\x00\x00\x00\x00",
        json.dumps({"t": "audio.stop"}),
    ])
    await srv._handle(ws)
    assert any('"transcript"' in s for s in ws.sent)
    assert hermes.turns == []  # transcription must NOT auto-run a turn


@pytest.mark.asyncio
async def test_text_frame_runs_a_turn():
    cfg = BridgeConfig(token="t", port=0)
    hermes = FakeHermes()
    srv = BridgeServer(cfg, hermes=hermes, transcriber=FakeTranscriber())
    ws = FakeWS([
        json.dumps({"t": "hello", "token": "t", "device": "x"}),
        json.dumps({"t": "text", "text": "do it"}),
    ])
    await srv._handle(ws)
    assert [t for (_, t) in hermes.turns] == ["do it"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Dev/hermes-evenhub-bridge && uv run pytest tests/test_server.py -k audio_stop_emits_transcript -v`
Expected: FAIL — `hermes.turns` is non-empty (the handler auto-runs the turn today).

- [ ] **Step 3: Make the change**

In `src/hermes_evenhub_bridge/server.py`, the `audio.stop` branch currently is:

```python
                await ws.send(P.transcript(text))
                if text:
                    await self._run(ws, active, text)
```

Remove the auto-run so it becomes:

```python
                await ws.send(P.transcript(text))
                # Do NOT run the turn here. The glasses show the transcript for
                # review and send an explicit `text` frame on confirm.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Dev/hermes-evenhub-bridge && uv run pytest tests/test_server.py -v`
Expected: PASS (both new tests + existing suite).

- [ ] **Step 5: Commit**

```bash
cd ~/Dev/hermes-evenhub-bridge
git add src/hermes_evenhub_bridge/server.py tests/test_server.py
git commit -m "feat(server): audio.stop emits transcript only; turn runs on explicit text"
```

- [ ] **Step 6: Write the failing delta test**

Add to `tests/test_server.py` (reuse the fakes from Step 1; give `FakeHermes.run_turn` a scripted event stream — match the real event object shape with `.kind`/`.text`/`.tool`/`.label`/`.emoji`/`.ok` as used in `server._run`):

```python
class Ev:
    def __init__(self, kind, text="", tool="", label="", emoji="", ok=True):
        self.kind, self.text, self.tool, self.label, self.emoji, self.ok = kind, text, tool, label, emoji, ok


class ScriptedHermes:
    def __init__(self, events):
        self._events = events
    async def run_turn(self, session_id, text):
        for e in self._events:
            yield e


@pytest.mark.asyncio
async def test_run_streams_incremental_deltas_not_cumulative():
    cfg = BridgeConfig(token="t", port=0)
    hermes = ScriptedHermes([
        Ev("text", text="Checking…"),
        Ev("tool_start", tool="terminal"),
        Ev("tool_end", tool="terminal", ok=True),
        Ev("text", text="Done."),
        Ev("done"),
    ])
    srv = BridgeServer(cfg, hermes=hermes, transcriber=FakeTranscriber())
    ws = FakeWS([
        json.dumps({"t": "hello", "token": "t", "device": "x"}),
        json.dumps({"t": "text", "text": "go"}),
    ])
    await srv._handle(ws)
    deltas = [json.loads(s)["text"] for s in ws.sent if '"assistant.delta"' in s]
    assert deltas == ["Checking…", "Done."]  # raw deltas, NOT cumulative ("Checking…Done.")
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd ~/Dev/hermes-evenhub-bridge && uv run pytest tests/test_server.py -k incremental_deltas -v`
Expected: FAIL — today `_run` sends cumulative `assistant`, not `assistant.delta`.

- [ ] **Step 8: Make the change**

In `src/hermes_evenhub_bridge/protocol.py`, add a builder next to `assistant`:

```python
def assistant_delta(text: str) -> str:
    return json.dumps({"t": "assistant.delta", "text": text})
```

In `src/hermes_evenhub_bridge/server.py`, change `_run` to stream raw deltas (drop the cumulative `acc`; the `final` event is not re-sent — the deltas already streamed the content):

```python
    async def _run(self, ws, session_id, text):
        async for e in self._hermes.run_turn(session_id, text):
            if e.kind == "text":
                await ws.send(P.assistant_delta(e.text))
            elif e.kind == "tool_start":
                await ws.send(P.tool_start(e.tool, e.label, e.emoji))
            elif e.kind == "tool_end":
                await ws.send(P.tool_end(e.tool, e.ok))
            elif e.kind == "done":
                break
        await ws.send(P.turn_done())
```

- [ ] **Step 9: Run tests + commit**

Run: `cd ~/Dev/hermes-evenhub-bridge && uv run pytest tests/test_server.py -v`
Expected: PASS (decouple + delta tests + existing suite).

```bash
git add src/hermes_evenhub_bridge/server.py src/hermes_evenhub_bridge/protocol.py tests/test_server.py
git commit -m "feat(server): stream incremental assistant deltas (correct stream interleaving)"
```

---

## Task 14: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Glasses suite + build**

Run: `cd ~/Dev/Even-Development && npm test && npm run build`
Expected: all tests PASS; build clean.

- [ ] **Step 2: Bridge suite**

Run: `cd ~/Dev/hermes-evenhub-bridge && uv run pytest -q`
Expected: all PASS.

- [ ] **Step 3: Update docs**

Update `README.md` Gesture Map and `docs/superpowers/plans/2026-05-29-hermes-g2-glasses-client.md` Status to reflect the Terminal-mode model (list-first; tap-record/tap-stop/review; double-press = back/exit). Commit:

```bash
git add README.md docs/superpowers/plans/2026-05-29-hermes-g2-glasses-client.md
git commit -m "docs: update gesture map + status for Terminal-mode redesign"
```

- [ ] **Step 4: On-device (manual, user-driven)**

With bridge + `npm run dev` + simulator running, drive via the automation API:
- Boot shows the list with `＋ New session`.
- Tap `＋New` (index 0/undefined) → session screen, bar `ready for input`.
- Stub a turn: tap (start), tap (stop) → bar `transcribing…`; inject a `transcript` frame → REVIEW shows `"…"`; tap → `> …` appears, reply streams (`/ tool ✓`, plain text), bar cycles `thinking… → working… (tool) → ready for input`.
- Swipe-down in review → discards. Double-press in session → back to list. Double-press on list → exit dialog.
- Full voice loop (record→Whisper→review→send) verified on real glasses via `npm run qr` (simulator can't feed PCM).

---

## Self-Review (completed during authoring)

- **Spec coverage:** state machine (T1–T7), stream model + serializer (T2, T8), agent-state bar + conn dot (T4, T10), list-first boot + `＋New` (T9, T11), bridge decouple (T13), lifecycle refinement (T11), tests + on-device (T14). All spec sections map to tasks.
- **Type consistency:** `AppState`/`StreamItem`/`Phase`/`Turn` defined in T1 and used unchanged through T11; `dispatch`/`Gesture`/`Effect` defined T5, extended T6–T7; `streamToText` (T8) consumed by `renderSession` (T10); `createListStartup`/`showListPage`/`showSessionPage` defined T9 and consumed in T10–T11.
- **Placeholders:** none — every code step is complete.
- **Note for executor:** the bridge test in T13 assumes `BridgeServer._handle(ws)` and constructor injection (`hermes=`, `transcriber=`) matching the existing suite; adjust the fake shapes to the real fixtures in `tests/test_server.py` if they differ, keeping the two assertions (transcript emitted; no auto-run).
