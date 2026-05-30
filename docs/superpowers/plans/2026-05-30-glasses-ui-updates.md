# Glasses UI Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the glasses-app session view — readable tool/agent separation, a fenced new-session banner, independent thread paging, a far-right connection dot with session-title header, and a session list that refreshes on return (GitHub issues #1, #3, #4, #5).

**Architecture:** All changes are in the glasses-app `glasses-app/` package and consume existing protocol frames — no wire-protocol changes. Two groups: (A) thread rendering & state shape (`ui/stream.ts`, `state/store.ts`); (B) session-screen behavior (`ui/render.ts`, `ui/views.ts`, `input/dispatch.ts`). The thread is rendered to a single body text container, paginated into ~360-char pages; the status line is already a separate pinned container.

**Tech Stack:** TypeScript, Vite, Vitest. Even Hub G2 SDK (`@evenrealities/even_hub_sdk`). Non-monospaced firmware font — horizontal `─` rules render cleanly, vertical box borders do not; glyphs outside the firmware set are silently skipped (verified-safe: `▸ ● ◌ ─ ✓ ✗`).

**Working directory:** all paths are relative to `glasses-app/`. Run all commands from `glasses-app/`.

---

## File structure

- `src/state/store.ts` — add `banner` to the `StreamItem` union; banner-vs-assistant detection in `reduce`; add `scrollPage` to `AppState`.
- `src/ui/stream.ts` — rewrite `streamToText` (`▸` tool marker, blank-line rules, banner fencing, no truncation); add `paginate` and `threadPages`.
- `src/ui/render.ts` — add the right-edge `dot` container (`IDS.dot`); header width shrinks to make room; `showSessionPage` rebuilds 4 containers.
- `src/ui/views.ts` — `renderSession` sets title + dot separately and renders the current thread page.
- `src/input/dispatch.ts` — session-idle scroll paging; `sessionsList()` effect on return-to-list.

Test files (existing, updated in-place): `tests/stream.test.ts`, `tests/store.test.ts`, `tests/views.test.ts`, `tests/render.test.ts`, `tests/dispatch.test.ts`.

---

## Task 1: Thread rendering — tool marker, blank lines, banner fence, pagination

**Files:**
- Modify: `src/state/store.ts` (StreamItem union only)
- Modify: `src/ui/stream.ts`
- Test: `tests/stream.test.ts`

- [ ] **Step 1: Add the `banner` variant to the StreamItem union**

In `src/state/store.ts`, change the `StreamItem` type:

```typescript
export type StreamItem =
  | { kind: "user"; text: string }
  | { kind: "tool"; name: string; running: boolean; ok?: boolean }
  | { kind: "assistant"; text: string }
  | { kind: "banner"; text: string };
```

- [ ] **Step 2: Rewrite the stream tests to the new format**

Replace the entire contents of `tests/stream.test.ts` with:

```typescript
import { describe, it, expect } from "vitest";
import { streamToText, paginate, threadPages } from "../src/ui/stream";
import type { StreamItem } from "../src/state/store";

const RULE = "─".repeat(40);

describe("streamToText", () => {
  it("> user, ▸ tool (running/done/failed), plain assistant", () => {
    const items: StreamItem[] = [
      { kind: "user", text: "add dark mode" },
      { kind: "tool", name: "terminal", running: false, ok: true },
      { kind: "assistant", text: "Added it." },
      { kind: "tool", name: "grep", running: true },
    ];
    expect(streamToText(items)).toBe(
      "> add dark mode\n\n▸ terminal ✓\n\nAdded it.\n\n▸ grep",
    );
  });
  it("marks a failed tool with ✗", () => {
    expect(streamToText([{ kind: "tool", name: "x", running: false, ok: false }])).toBe("▸ x ✗");
  });
  it("keeps consecutive tool calls tight (single newline)", () => {
    const items: StreamItem[] = [
      { kind: "tool", name: "a", running: false, ok: true },
      { kind: "tool", name: "b", running: false, ok: true },
    ];
    expect(streamToText(items)).toBe("▸ a ✓\n▸ b ✓");
  });
  it("fences a banner with horizontal rules", () => {
    const items: StreamItem[] = [{ kind: "banner", text: "model: claude-opus\ncwd: ~/dev" }];
    expect(streamToText(items)).toBe(`${RULE}\n model: claude-opus\n cwd: ~/dev\n${RULE}`);
  });
  it("separates a banner from following text with a blank line", () => {
    const items: StreamItem[] = [
      { kind: "banner", text: "model: x" },
      { kind: "user", text: "hi" },
    ];
    expect(streamToText(items)).toBe(`${RULE}\n model: x\n${RULE}\n\n> hi`);
  });
  it("returns empty string for an empty stream", () => {
    expect(streamToText([])).toBe("");
  });
});

describe("paginate", () => {
  it("returns one empty page for empty text", () => {
    expect(paginate("")).toEqual([""]);
  });
  it("splits on line boundaries within the char budget", () => {
    // three 10-char lines, budget 25 → pages of 2 then 1 line
    const text = "0123456789\n0123456789\n0123456789";
    const pages = paginate(text, 25);
    expect(pages).toEqual(["0123456789\n0123456789", "0123456789"]);
  });
  it("hard-splits a single line longer than the budget", () => {
    expect(paginate("abcdef", 3)).toEqual(["abc", "def"]);
  });
});

describe("threadPages", () => {
  it("renders then paginates the stream", () => {
    const items: StreamItem[] = [{ kind: "user", text: "hi" }];
    expect(threadPages(items)).toEqual(["> hi"]);
  });
});
```

- [ ] **Step 3: Run the stream tests to verify they fail**

Run: `npx vitest run tests/stream.test.ts`
Expected: FAIL — `paginate`/`threadPages` are not exported, `streamToText` still emits `/` markers and single newlines.

- [ ] **Step 4: Rewrite `src/ui/stream.ts`**

Replace the entire contents of `src/ui/stream.ts` with:

```typescript
import type { StreamItem } from "../state/store";

const RULE = "─".repeat(40);

function renderItem(it: StreamItem): string {
  if (it.kind === "user") return `> ${it.text}`;
  if (it.kind === "tool") return `▸ ${it.name}${it.running ? "" : it.ok === false ? " ✗" : " ✓"}`;
  if (it.kind === "banner") {
    const body = it.text.split("\n").map((l) => ` ${l}`).join("\n");
    return `${RULE}\n${body}\n${RULE}`;
  }
  return it.text; // assistant
}

// Items join with "\n"; an extra blank line separates everything EXCEPT two
// adjacent tool calls, so a multi-tool run reads as one tight block while a
// tool group is visually broken away from the agent text around it.
export function streamToText(items: StreamItem[]): string {
  let out = "";
  for (let i = 0; i < items.length; i++) {
    if (i > 0) {
      const tightTools = items[i - 1].kind === "tool" && items[i].kind === "tool";
      out += tightTools ? "\n" : "\n\n";
    }
    out += renderItem(items[i]);
  }
  return out;
}

// Pre-paginate at a char budget on line boundaries (firmware font is not
// monospaced, so exact line measurement is unreliable; char budget is
// deterministic and testable). Always returns at least one page.
export function paginate(text: string, pageChars = 360): string[] {
  const rawLines = text.split("\n");
  const lines: string[] = [];
  for (const ln of rawLines) {
    if (ln.length <= pageChars) lines.push(ln);
    else for (let i = 0; i < ln.length; i += pageChars) lines.push(ln.slice(i, i + pageChars));
  }
  const pages: string[] = [];
  let cur: string[] = [];
  let len = 0;
  for (const ln of lines) {
    const sep = cur.length ? 1 : 0;
    if (cur.length && len + sep + ln.length > pageChars) {
      pages.push(cur.join("\n"));
      cur = [];
      len = 0;
    }
    len += (cur.length ? 1 : 0) + ln.length;
    cur.push(ln);
  }
  pages.push(cur.join("\n"));
  return pages;
}

export function threadPages(items: StreamItem[], pageChars = 360): string[] {
  return paginate(streamToText(items), pageChars);
}
```

- [ ] **Step 5: Run the stream tests to verify they pass**

Run: `npx vitest run tests/stream.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add src/state/store.ts src/ui/stream.ts tests/stream.test.ts
git commit -m "feat(glasses): ▸ tool markers, blank-line separation, banner fence, thread pagination (#3, #4)"
```

---

## Task 2: New-session banner detection in the reducer (#1)

The banner is any assistant output that arrives **before the first `user` item** in the session. Accumulate it into a `banner` item; once a `user` item exists, subsequent assistant output is normal `assistant` text.

**Files:**
- Modify: `src/state/store.ts`
- Test: `tests/store.test.ts`

- [ ] **Step 1: Update store tests for banner detection**

In `tests/store.test.ts`, replace the entire `describe("reduce: stream", ...)` block with:

```typescript
describe("reduce: stream", () => {
  it("assistant output BEFORE the first user item is a banner", () => {
    let s = initialState();
    s = reduce(s, { t: "assistant.delta", text: "model: x" });
    s = reduce(s, { t: "assistant.delta", text: "\ncwd: y" });
    expect(s.stream).toEqual([{ kind: "banner", text: "model: x\ncwd: y" }]);
  });
  it("assistant output AFTER a user item is assistant text", () => {
    let s: AppState = { ...initialState(), stream: [{ kind: "user", text: "hi" }] };
    s = reduce(s, { t: "assistant.delta", text: "It's" });
    s = reduce(s, { t: "assistant.delta", text: " Friday" });
    expect(s.stream).toEqual([
      { kind: "user", text: "hi" },
      { kind: "assistant", text: "It's Friday" },
    ]);
  });
  it("a delta after a tool opens a NEW assistant segment", () => {
    let s: AppState = { ...initialState(), stream: [{ kind: "user", text: "hi" }] };
    s = reduce(s, { t: "assistant.delta", text: "Checking…" });
    s = reduce(s, { t: "tool.start", name: "terminal" });
    s = reduce(s, { t: "tool.end", name: "terminal", ok: true });
    s = reduce(s, { t: "assistant.delta", text: "Done." });
    expect(s.stream).toEqual([
      { kind: "user", text: "hi" },
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

- [ ] **Step 2: Run the store tests to verify they fail**

Run: `npx vitest run tests/store.test.ts -t "reduce: stream"`
Expected: FAIL — the banner test gets `{ kind: "assistant", ... }` (current code never produces `banner`).

- [ ] **Step 3: Replace `appendDelta` with banner-aware `appendStream`**

In `src/state/store.ts`, replace the `appendDelta` function:

```typescript
function appendDelta(stream: StreamItem[], delta: string): StreamItem[] {
  const last = stream[stream.length - 1];
  if (last && last.kind === "assistant") {
    return [...stream.slice(0, -1), { kind: "assistant", text: last.text + delta }];
  }
  return [...stream, { kind: "assistant", text: delta }];
}
```

with:

```typescript
// Assistant output before the first user item is the session banner (model,
// cwd, …); after the user has spoken it is normal assistant text. Either kind
// extends its own trailing segment so streamed deltas coalesce.
function appendStream(stream: StreamItem[], delta: string): StreamItem[] {
  const kind: "assistant" | "banner" =
    stream.some((it) => it.kind === "user") ? "assistant" : "banner";
  const last = stream[stream.length - 1];
  if (last && last.kind === kind) {
    return [...stream.slice(0, -1), { kind, text: last.text + delta } as StreamItem];
  }
  return [...stream, { kind, text: delta } as StreamItem];
}
```

- [ ] **Step 4: Route assistant frames through `appendStream`**

In `src/state/store.ts`, inside `reduce`, replace the `assistant.delta` case:

```typescript
    case "assistant.delta":
      return { ...s, stream: appendDelta(s.stream, m.text) };
```

with both a delta and a full-frame case:

```typescript
    case "assistant.delta":
    case "assistant":
      return { ...s, stream: appendStream(s.stream, m.text) };
```

- [ ] **Step 5: Run the store tests to verify they pass**

Run: `npx vitest run tests/store.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/state/store.ts tests/store.test.ts
git commit -m "feat(glasses): detect pre-user assistant output as a session banner (#1)"
```

---

## Task 3: Independent thread paging (#4 scroll)

Add a thread page cursor to `AppState`: `scrollPage` is `null` to follow the latest page (auto-follow) or an absolute page index from the top to hold position when scrolled up. Session-idle `scrollUp`/`scrollDown` move it; `renderSession` renders the current page.

**Files:**
- Modify: `src/state/store.ts`
- Modify: `src/input/dispatch.ts`
- Modify: `src/ui/views.ts`
- Test: `tests/dispatch.test.ts`, `tests/views.test.ts`

- [ ] **Step 1: Add `scrollPage` to the state**

In `src/state/store.ts`, add the field to the `AppState` interface (after `turn: Turn;`):

```typescript
  turn: Turn;
  scrollPage: number | null; // null = follow latest page; number = absolute page index (held)
```

And in `initialState()`, add it to the returned object (after `turn: "idle",`):

```typescript
    turn: "idle",
    scrollPage: null,
```

- [ ] **Step 2: Write the dispatch scroll tests**

In `tests/dispatch.test.ts`, add this import at the top (alongside the existing imports):

```typescript
import { threadPages } from "../src/ui/stream";
```

Then add a new describe block at the end of the file:

```typescript
function longSession(): AppState {
  const big = "x".repeat(800); // ~3 pages at the 360-char budget
  return {
    ...initialState(),
    screen: "session",
    phase: "idle",
    stream: [{ kind: "user", text: "hi" }, { kind: "assistant", text: big }],
  };
}

describe("dispatch: session idle scrolling", () => {
  it("scrollUp from follow moves to the second-to-last page", () => {
    const pages = threadPages(longSession().stream);
    const r = dispatch(longSession(), "scrollUp");
    expect(r.state.scrollPage).toBe(pages.length - 2);
    expect(r.effects).toEqual([]);
  });
  it("scrollUp clamps at the first page", () => {
    const r = dispatch({ ...longSession(), scrollPage: 0 }, "scrollUp");
    expect(r.state.scrollPage).toBe(0);
  });
  it("scrollDown to the last page resumes follow (null)", () => {
    const pages = threadPages(longSession().stream);
    const r = dispatch({ ...longSession(), scrollPage: pages.length - 2 }, "scrollDown");
    expect(r.state.scrollPage).toBeNull();
  });
  it("scrollDown while already following is a no-op", () => {
    const r = dispatch({ ...longSession(), scrollPage: null }, "scrollDown");
    expect(r.state.scrollPage).toBeNull();
  });
});
```

- [ ] **Step 3: Run the dispatch tests to verify they fail**

Run: `npx vitest run tests/dispatch.test.ts -t "session idle scrolling"`
Expected: FAIL — scroll is currently a no-op in session idle, so `scrollPage` stays `null`.

- [ ] **Step 4: Implement scroll paging in dispatch**

In `src/input/dispatch.ts`, add the import at the top:

```typescript
import { threadPages } from "../ui/stream";
```

In `enterSession`, add `scrollPage: null` so entering/switching a session resets to follow:

```typescript
const enterSession = (s: AppState, active: string | null): AppState => ({
  ...s, screen: "session", phase: "idle", stream: [], pending: null, turn: "idle",
  scrollPage: null,
  sessions: { ...s.sessions, active },
});
```

Replace the `s.phase === "idle"` block:

```typescript
  if (s.phase === "idle") {
    if (g === "click") return { state: { ...s, phase: "recording" }, effects: [{ kind: "startMic" }] };
    if (g === "doubleClick") return { state: { ...s, screen: "list", phase: "idle", pending: null }, effects: [] };
    return { state: s, effects: [] };
  }
```

with:

```typescript
  if (s.phase === "idle") {
    if (g === "click") return { state: { ...s, phase: "recording" }, effects: [{ kind: "startMic" }] };
    if (g === "doubleClick") return { state: { ...s, screen: "list", phase: "idle", pending: null }, effects: [] };
    if (g === "scrollUp") {
      const pages = threadPages(s.stream);
      const cur = s.scrollPage === null ? pages.length - 1 : s.scrollPage;
      return { state: { ...s, scrollPage: Math.max(0, cur - 1) }, effects: [] };
    }
    if (g === "scrollDown") {
      if (s.scrollPage === null) return { state: s, effects: [] };
      const pages = threadPages(s.stream);
      const next = s.scrollPage + 1;
      return { state: { ...s, scrollPage: next >= pages.length - 1 ? null : next }, effects: [] };
    }
    return { state: s, effects: [] };
  }
```

- [ ] **Step 5: Run the dispatch tests to verify they pass**

Run: `npx vitest run tests/dispatch.test.ts -t "session idle scrolling"`
Expected: PASS.

- [ ] **Step 6: Render the current page in the body**

In `src/ui/views.ts`, change the import on line 5 from:

```typescript
import { streamToText } from "./stream";
```

to:

```typescript
import { threadPages } from "./stream";
```

Replace the body assignment inside `renderSession`:

```typescript
  const body =
    s.phase === "review" && s.pending
      ? `"${s.pending.transcript}"`
      : streamToText(s.stream) || "tap to speak";
  await setText(bridge, IDS.body, body);
```

with:

```typescript
  const body =
    s.phase === "review" && s.pending
      ? `"${s.pending.transcript}"`
      : s.stream.length === 0
        ? "tap to speak"
        : threadPage(s);
  await setText(bridge, IDS.body, body);
```

And add this helper at the bottom of `src/ui/views.ts`:

```typescript
function threadPage(s: AppState): string {
  const pages = threadPages(s.stream);
  const idx = s.scrollPage === null ? pages.length - 1 : Math.min(s.scrollPage, pages.length - 1);
  return pages[idx] ?? "";
}
```

- [ ] **Step 7: Run the views tests to verify they still pass**

Run: `npx vitest run tests/views.test.ts`
Expected: PASS — the existing body test (`> hi`, single page) and review test are unaffected.

- [ ] **Step 8: Commit**

```bash
git add src/state/store.ts src/input/dispatch.ts src/ui/views.ts tests/dispatch.test.ts
git commit -m "feat(glasses): independent thread paging with auto-follow (#4)"
```

---

## Task 4: Header split with far-right connection dot + session title (#4)

Split the single full-width header into a left **title** container and a small right-edge **dot** container so the dot sits at the true right edge (space-padding can't right-align with a proportional font). Title shows the session title once set, else `Hermes`.

**Files:**
- Modify: `src/ui/render.ts`
- Modify: `src/ui/views.ts`
- Test: `tests/render.test.ts`, `tests/views.test.ts`

- [ ] **Step 1: Update the render + views tests**

In `tests/render.test.ts`, change the session-page test to expect 4 containers:

```typescript
describe("session page", () => {
  it("showSessionPage rebuilds four text containers (header, dot, body, status)", async () => {
    const b = fakeBridge();
    await showSessionPage(b);
    const arg = b.rebuildPageContainer.mock.calls[0][0];
    expect(arg.containerTotalNum).toBe(4);
    expect(arg.textObject).toHaveLength(4);
  });
});
```

In `tests/views.test.ts`, change the first `renderSession` assertions from:

```typescript
    expect(calls[1]).toBe("build the app  ●");   // IDS.header
    expect(calls[2]).toBe("> hi");                // IDS.body
    expect(calls[3]).toBe("ready for input");     // IDS.status
```

to:

```typescript
    expect(calls[1]).toBe("build the app");      // IDS.header (title only)
    expect(calls[5]).toBe("●");                   // IDS.dot (far-right)
    expect(calls[2]).toBe("> hi");                // IDS.body
    expect(calls[3]).toBe("ready for input");     // IDS.status
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/render.test.ts tests/views.test.ts`
Expected: FAIL — only 3 containers exist; header still contains the dot; `IDS.dot` is undefined.

- [ ] **Step 3: Add the `dot` container in render.ts**

In `src/ui/render.ts`, change the `IDS` and `NAMES` declarations:

```typescript
export const IDS = { header: 1, body: 2, status: 3, list: 4, dot: 5 } as const;
export const NAMES: Record<number, string> = {
  [IDS.header]: "header", [IDS.body]: "body", [IDS.status]: "status",
  [IDS.list]: "list", [IDS.dot]: "dot",
};
```

Replace `chatTextObjects`:

```typescript
function chatTextObjects(): TextContainerProperty[] {
  return [
    new TextContainerProperty({ containerID: IDS.header, containerName: "header", xPosition: 0,   yPosition: 0,   width: 540, height: 40,  paddingLength: 4, content: "Hermes" }),
    new TextContainerProperty({ containerID: IDS.dot,    containerName: "dot",    xPosition: 540, yPosition: 0,   width: 36,  height: 40,  paddingLength: 4, content: "◌" }),
    new TextContainerProperty({ containerID: IDS.body,   containerName: "body",   xPosition: 0,   yPosition: 44,  width: 576, height: 200, paddingLength: 4, content: "", isEventCapture: 1 }),
    new TextContainerProperty({ containerID: IDS.status, containerName: "status", xPosition: 0,   yPosition: 248, width: 576, height: 36,  paddingLength: 4, content: "connecting…" }),
  ];
}
```

Change `showSessionPage` to rebuild 4 containers:

```typescript
export async function showSessionPage(bridge: EvenAppBridge): Promise<void> {
  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 4,
    textObject: chatTextObjects(),
  }));
}
```

- [ ] **Step 4: Set title and dot separately in views.ts**

In `src/ui/views.ts`, replace the header lines inside `renderSession`:

```typescript
  const active = s.sessions.items.find((i) => i.id === s.sessions.active);
  const title = active ? truncateRow(active.title) : "Hermes";
  await setText(bridge, IDS.header, `${title}  ${connDot(s.conn)}`);
```

with:

```typescript
  const active = s.sessions.items.find((i) => i.id === s.sessions.active);
  const title = active && active.title.trim() ? truncateRow(active.title) : "Hermes";
  await setText(bridge, IDS.header, title);
  await setText(bridge, IDS.dot, connDot(s.conn));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/render.test.ts tests/views.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/render.ts src/ui/views.ts tests/render.test.ts tests/views.test.ts
git commit -m "feat(glasses): split header with far-right connection dot + session title (#4)"
```

---

## Task 5: Refresh the session list on return (#5)

Re-fetch the list whenever the user returns to it from a session, so new sessions and updated titles appear. Emit a `sessionsList()` send-effect on the two `doubleClick → list` transitions.

**Files:**
- Modify: `src/input/dispatch.ts`
- Test: `tests/dispatch.test.ts`

- [ ] **Step 1: Update the return-to-list tests to expect a refresh effect**

In `tests/dispatch.test.ts`, change the import line:

```typescript
import { sessionsNew, sessionsSwitch, textMsg } from "../src/protocol";
```

to add `sessionsList`:

```typescript
import { sessionsNew, sessionsSwitch, textMsg, sessionsList } from "../src/protocol";
```

In `describe("dispatch: session idle", ...)`, change the `double-press returns to the list` test's effects assertion from:

```typescript
    expect(r.effects).toEqual([]);
```

to:

```typescript
    expect(r.effects).toEqual([{ kind: "send", frame: sessionsList() }]);
```

In `describe("dispatch: session review", ...)`, change the `double-press discards and returns to the list` test's effects assertion from:

```typescript
    expect(r.effects).toEqual([]);
```

to:

```typescript
    expect(r.effects).toEqual([{ kind: "send", frame: sessionsList() }]);
```

- [ ] **Step 2: Run the dispatch tests to verify they fail**

Run: `npx vitest run tests/dispatch.test.ts -t "returns to the list"`
Expected: FAIL — return-to-list currently emits no effects.

- [ ] **Step 3: Emit `sessionsList()` on return-to-list**

In `src/input/dispatch.ts`, add `sessionsList` to the protocol import:

```typescript
import { sessionsNew, sessionsSwitch, textMsg, sessionsList } from "../protocol";
```

In the `s.phase === "idle"` block, change the `doubleClick` return from:

```typescript
    if (g === "doubleClick") return { state: { ...s, screen: "list", phase: "idle", pending: null }, effects: [] };
```

to:

```typescript
    if (g === "doubleClick") return { state: { ...s, screen: "list", phase: "idle", pending: null }, effects: [{ kind: "send", frame: sessionsList() }] };
```

In the `s.phase === "review"` block, change the `doubleClick` return from:

```typescript
    if (g === "doubleClick") return { state: { ...s, screen: "list", phase: "idle", pending: null }, effects: [] };
```

to:

```typescript
    if (g === "doubleClick") return { state: { ...s, screen: "list", phase: "idle", pending: null }, effects: [{ kind: "send", frame: sessionsList() }] };
```

- [ ] **Step 4: Run the dispatch tests to verify they pass**

Run: `npx vitest run tests/dispatch.test.ts`
Expected: PASS (whole file).

- [ ] **Step 5: Commit**

```bash
git add src/input/dispatch.ts tests/dispatch.test.ts
git commit -m "feat(glasses): refresh session list on return from a session (#5)"
```

---

## Task 6: Full verification + gateway banner confirmation

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: PASS — all test files green.

- [ ] **Step 2: Type-check / build**

Run: `npx tsc --noEmit`
Expected: no type errors. (If `tsc --noEmit` is not wired, run `npm run pack` and stop after the `tsc` step succeeds.)

- [ ] **Step 3: Confirm the banner frame type against the live gateway**

Issue #1 assumes the opening banner streams as `assistant.delta`. Task 2 already routes both `assistant.delta` and the plain `assistant` frame through `appendStream`, so either works. Verify which the gateway actually sends and that the banner renders fenced:

Run: `npm run sim:check` (automated smoke against the simulator), or `npm run sim` and open a new session.
Expected: the opening model/cwd text appears inside the `─`-fenced block; once you speak, your `> message` and the agent reply render below it as normal (unfenced) text.

If neither frame produces banner text, capture the actual opening frames (log inbound frames in `net/ws-client.ts`'s `onMessage`) and adjust the `reduce` case to match the real frame type — no other code changes needed.

- [ ] **Step 4: Manual smoke of the four behaviors on the simulator**

With `npm run sim` running, confirm:
- Header shows `Hermes` then the session title once set; the connection dot sits at the far right.
- Tool runs render with `▸` and a blank line separates them from agent text.
- `scrollUp`/`scrollDown` page through a long thread while the status line stays pinned; new deltas auto-follow when at the bottom and hold position when scrolled up.
- Returning to the list (double-press) shows freshly fetched sessions/titles.

- [ ] **Step 5: Final commit (only if Step 3 required a frame-type change)**

```bash
git add src/state/store.ts
git commit -m "fix(glasses): match opening banner to the gateway's actual frame type (#1)"
```

---

## Out of scope

- **#2 Set home channel directory** — gateway/bridge behavior; separate spec.
- Phone-side (Flutter WebView) UI.
- Any change to the wire protocol contract (`protocol.ts` / `protocol.py`).
