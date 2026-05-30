# Glasses UI Updates — Design

Date: 2026-05-30
Scope: `glasses-app/` only. Covers four open GitHub issues grouped into two work
units. Issue #2 (gateway home/channel directory) is explicitly **out of scope** —
it is a bridge/gateway concern and gets its own spec.

## Issues covered

- **#1 New Session Text** — the agent's opening context banner (model, cwd, etc.)
  streams in as plain assistant text and floods the ~6-line body. Wrap it in a
  divider-fenced block.
- **#3 Tool calls and messages** — no separation between assistant text and tool
  calls; tool/non-agent actions need a distinct marker.
- **#4 UI tweaks** — (a) line break separating the status line from the thread,
  (b) thread scrolls independently while the status line stays pinned at the
  bottom, (c) header changes from `Hermes` to the session title once set, with the
  connection dot pinned to the far right.
- **#5 Session list update** — the list does not refresh when navigating back to
  it (it only loads once on `hello.ok`).

## Display constraints that shape every decision

From `everything-evenhub:design-guidelines`:

- **576×288, single non-monospaced LVGL firmware font.** No text alignment — you
  "right-align" only by padding spaces, which never lands precisely. Therefore a
  fully bordered box (vertical `│` edges) renders with ragged, misaligned right
  borders. **Horizontal rule lines (`─`) render cleanly; vertical box borders do
  not.**
- **Glyphs outside the firmware font are silently skipped.** A gear `⚙`/wrench is
  not in the verified set and may vanish. Verified-safe glyphs: navigation
  triangles `▲▶▼◀ △▷▽◁`, selection marks `●○ ■□ ★☆`, box-drawing `╭╮╯╰ │─`. Plain
  ASCII (`/ > ▸`) is always safe. `✓`/`✗` are already used in `stream.ts` and
  render in practice (verify on the simulator when touched).
- **~400–500 characters fill a full-screen text container.** Page-flip pattern:
  pre-paginate at ~400-char boundaries and rebuild on scroll.

## Current architecture (relevant pieces)

- `state/store.ts` — `AppState`, `StreamItem` union (`user` | `tool` | `assistant`),
  `reduce()`, `barText()`, `connDot()`. `reduce` handles `assistant.delta` but
  **not** the plain `assistant` frame (falls through to default → unchanged).
- `ui/stream.ts` — `streamToText()` maps `StreamItem[]` to a single string:
  `> ` for user, `/ name ✓/✗` for tools, raw text for assistant, joined by `\n`,
  tail-truncated to `maxChars`.
- `ui/views.ts` — `renderSession()` sets three text containers: header
  (`title  ●/◌`), body (`streamToText` or pending transcript), status
  (`barText`). `listRows()` builds `＋ New session` + truncated titles.
- `ui/render.ts` — `chatTextObjects()` declares header (id 1, full-width),
  body (id 2), status (id 3); `listContainer()` for the list (id 4). `setText()`
  does full-replacement `textContainerUpgrade`.
- `input/dispatch.ts` — gesture → state + effects. In session **idle**,
  `scrollUp`/`scrollDown` are no-ops. `doubleClick` returns to the list. List
  refresh is never re-triggered after the initial `hello.ok`.
- `main.ts` — `onMessage` reduces frames and re-renders; sends `sessionsList()`
  only on `hello.ok`. Screen-change rebuilds the page container.

---

## Group A — Thread readability

Files: `state/store.ts`, `ui/stream.ts`. Pure rendering/state-shape changes; no
new SDK containers.

### A1. Line breaks & tool markers (#3, #4 line-break)

Rewrite `streamToText()` so the thread reads as separated blocks:

- user → `> {text}`
- tool → `▸ {name}` plus status suffix: ` ✓` (ok), ` ✗` (failed), nothing while
  running.
- assistant → `{text}`, no prefix.
- **Blank line** inserted between a tool group and adjacent assistant/user text,
  and between distinct turns. **Consecutive tool calls stay tight** (no blank line
  between them) so a multi-tool run reads as one block.

The `▸` (U+25B8) marker distinguishes tool/non-agent actions from user `>` and
unprefixed agent text. Keep `✓`/`✗`.

Tail-truncation (`maxChars`) is superseded by pagination (B2); `streamToText`
should render the full thread and let the pager slice it.

### A2. New-session banner card (#1)

Add a `banner` variant to the `StreamItem` union (context text). Detection rule:
**any assistant output that arrives before the first `user` item in the session is
the banner.** Accumulate it into a single `banner` item instead of a normal
`assistant` item; once a `user` item exists, subsequent assistant output is normal
`assistant` text.

Render the banner fenced by horizontal rule lines (no vertical borders):

```
────────────────────────────────────────
 {banner text, one field per line}
────────────────────────────────────────
```

Reducer changes in `reduce()`:

- On `assistant.delta` (and `assistant`, see below): if the stream contains no
  `user` item yet, append/extend a `banner` item; otherwise the existing
  `appendDelta` assistant behavior.

**Verification step (implementation):** confirm against the live gateway whether
the opening banner arrives as `assistant.delta` (already handled) or the plain
`assistant` frame (currently unhandled). Wire whichever it is into the banner
path. If it is the `assistant` frame, add a `reduce` case for it.

---

## Group B — Session screen behavior

Files: `ui/render.ts`, `ui/views.ts`, `input/dispatch.ts`, `main.ts`,
`state/store.ts`.

### B1. Header split + far-right connection dot (#4)

Split the single full-width header container into two text containers:

- **title** (left): `Hermes` until the active session has a title, then the
  session title (truncated to fit).
- **dot** (right edge, ~`xPosition: 540, width: 36`): only `●` (connected) /
  `◌` (connecting), via `connDot()`.

This pins the dot to the true right edge regardless of title length, which
space-padding cannot achieve with a proportional font. Update `chatTextObjects()`
(new container id + name, ≤16 chars), `showSessionPage` container count, and
`renderSession()` to set the two containers separately. Container budget is fine
(≤8 text/list containers).

### B2. Independent thread scrolling (#4)

Status is already a separate pinned container (id 3 at y=248), so it stays at the
bottom for free. New behavior:

- Add a thread **page offset** to `AppState` (e.g. `scrollOffset`, in pages or
  lines), reset to "latest" on session enter/switch (`enterSession`).
- Pre-paginate the rendered thread (from A1's full `streamToText`) into
  ~400-char / ~6-line pages and render the page at the current offset into the
  body.
- In session **idle** phase, map `scrollUp` → older page, `scrollDown` → newer
  page (clamped). These are currently no-ops, so there is no gesture conflict.
- **Auto-follow:** when the offset is at the latest page, new deltas keep it
  pinned to the latest. When the user has scrolled up, hold position until they
  scroll back to the bottom.

Recording/review phases keep their existing `scrollDown` meanings (review:
`scrollDown` = redo); only idle gains scroll-to-page.

### B3. Session list refresh (#5)

Re-fetch the list every time it is shown. Emit a `send sessionsList()` effect on
the two `doubleClick → screen:"list"` transitions in `dispatch.ts` (from session
idle and from review). The list then picks up new sessions and updated titles on
every return. `main.ts` already routes `send` effects through the client.

---

## Out of scope

- **#2 Set home channel directory** — gateway/bridge behavior (mirrors Discord);
  separate spec.
- Phone-side (Flutter WebView) UI.
- Any change to the wire protocol contract (`protocol.ts` /
  `protocol.py`). All work consumes existing frames.

## Testing

- `glasses-app` vitest: unit-test `streamToText` (markers, blank-line rules,
  banner fencing, multi-tool grouping), the `reduce` banner detection
  (assistant-before-first-user), pagination/offset clamping + auto-follow, and the
  `dispatch` list-refresh effect on return-to-list.
- Manual: `npm run sim` / `npm run sim:check` smoke for header dot placement,
  scroll paging, banner rendering, and list refresh.
