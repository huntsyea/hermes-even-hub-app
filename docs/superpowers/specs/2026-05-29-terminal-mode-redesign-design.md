# Design: Terminal-Mode Interaction Redesign — Hermes ↔ G2 Glasses Client

**Date:** 2026-05-29
**Status:** Approved (brainstorm) — pending implementation plan
**Supersedes:** the tap-centric interaction model in the original build (M1–M6). The
transport, ASR pipeline, streaming, and persistence are kept; the *interaction model
and session screen* are redesigned to mirror Even Realities **Terminal mode**.

## Problem

The shipped interaction model is confusing: boot lands in a chat view, single-tap
sends a hardcoded test turn, double-tap toggles the mic, and the session list is a
secondary view reached by a swipe. This does not match how the user wants to work,
and it fights the platform (e.g. double-tap is the SDK's canonical exit gesture).

The user wants to mirror Even's **Terminal mode** UX: start on a session list, pick
or create a session, then drive it hands-free by voice — speak an instruction, see
the transcript, confirm or redo, and watch the reply stream in a terminal-style log.

## Hard constraints (verified against the SDK + handle-input skill)

- **No hold / long-press gesture exists.** Even Hub apps receive only discrete touch
  events: `CLICK_EVENT (0)`, `DOUBLE_CLICK_EVENT (3)`, `SCROLL_TOP_EVENT (1)`,
  `SCROLL_BOTTOM_EVENT (2)`, plus lifecycle events. Terminal's literal "tap and hold
  to record" is firmware-level and unavailable to us. Recording must be tap-triggered.
- **`CLICK_EVENT` ordinal is 0**, which protobuf omits from the event JSON, and the
  SDK does not default it — so a click arrives as `sysEvent` with no `eventType`.
  (Already fixed in `routeEvent`; the redesign must preserve that handling.)
- **Mic is a toggle:** `bridge.audioControl(true|false)` — not a press-hold.
- **Double-press is the canonical exit gesture** (`shutDownPageContainer(1)` → system
  exit dialog). We reserve it for navigation/exit, never for content actions.
- **List containers** scroll internally on swipe (no event); single-press fires
  `listEvent.currentSelectItemIndex`; double-press fires `sysEvent` type 3.
- Display is **576×288, 4-bit grey**; persist state only via `setLocalStorage`.

## Interaction model

A four-state machine. `screen ∈ {list, session}`; within `session`,
`phase ∈ {idle, recording, review}`.

```
        ┌──────────── boot ────────────┐
        ▼                               │
  ┌───────────┐  tap "＋New" / a row    │
  │  LIST     │ ──────────────────────► │
  │ (sessions)│ ◄──── double-press ──── │  (back from session)
  └───────────┘                         │
        │ double-press                   ▼
        ▼                          ┌───────────────┐
   EXIT (system dialog)            │ SESSION: idle │◄──┐
                                   └───────────────┘   │ after send,
                                     │ tap              │ reply streams
                                     ▼                  │ then back to idle
                                ┌───────────┐           │
                                │ RECORDING │           │
                                └───────────┘           │
                                     │ tap (stop) → transcribing
                                     ▼                  │
                                ┌───────────┐  swipe↓   │
                                │  REVIEW   │ ──redo────┘
                                └───────────┘
                                     │ tap = send (text.send → Hermes)
                                     ▼
                                  SESSION: idle (reply streams in)
```

### Gesture map (state-dependent)

| State | swipe ↑/↓ | tap | double-press |
|---|---|---|---|
| **List** | scroll sessions (native) | open highlighted row / `＋New` | **exit app** (system dialog) |
| **Session · idle** | scroll chat history | **start recording** | back to list |
| **Session · recording** | — | **stop → transcribe → review** | cancel recording → idle |
| **Session · review** | ↓ = **redo** (discard, re-arm) | **send** to Hermes | back to list (discard) |

Boot **always** lands on the list (even if a last session is persisted). Creating a
new session and opening an existing one both transition to `session · idle`.

## Screens (terminal aesthetic, 576×288)

The existing 3-container page (header / body / status) is reused; only the contents
change.

### List

```
┌────────────────────┐
│ ＋ New session      │  ← always the top row
│ ─────────────────  │
│ › build the app    │  ← existing sessions (title), native highlight + scroll
│   refactor parser  │
│   triage inbox     │
└────────────────────┘
```

`＋ New session` is index 0; existing sessions follow. Single-press on index 0 →
create + open; on any other index → open that session. Titles truncate to width.

### Session

```
┌──────────────────────────────────┐
│ build the app                 ●  │  ← header: session title + connection dot
│ ───────────────────────────────  │
│ > add a dark mode toggle         │  ← stream (chronological):
│ / terminal ✓                     │     >  your entries
│ Added a dark mode toggle to the  │     /  tool calls
│ settings panel.                  │     (plain) assistant text
│ > make it the default            │
│ / terminal                       │
│ ───────────────────────────────  │
│ working…                         │  ← agent-state bar
└──────────────────────────────────┘
```

- **Header:** session title + a connection dot — `●` connected, `◌` reconnecting.
  Connection state lives *only* here, keeping the stream purely conversational.
- **Body (stream):** one chronological log. Line prefixes: `>` user entries, `/`
  tool calls (`/ name` while running, `/ name ✓` when done), no prefix for assistant
  prose (wraps). Renders the tail that fits the body; older lines scroll off.
- **Agent-state bar (bottom):** single source of "what's happening now":

  | State | Bar text | When |
  |---|---|---|
  | idle | `ready for input` | session open, awaiting tap |
  | recording | `🎤 recording…` | mic on (tap to stop) |
  | transcribing | `transcribing…` | Whisper running after stop |
  | review | `tap = send · swipe↓ = redo` | transcript shown, awaiting confirm |
  | waiting | `thinking…` | turn sent, before first token |
  | tool running | `working… (<tool>)` | a `/` tool is active |
  | done | `ready for input` | turn complete |

### Recording / Review

Recording reuses the session screen with the bar at `🎤 recording…` and an otherwise
quiet body. Review shows the transcript verbatim in the body with the bar prompting
`tap = send · swipe↓ = redo`.

## Architecture

### A. Glasses state + data model (`src/state/store.ts`)

Replace the loose `view` + `recording` flags with an explicit state machine, and
replace the single `assistant` string with an ordered stream.

```ts
type Screen = "list" | "session"
type Phase  = "idle" | "recording" | "transcribing" | "review"   // meaningful only when screen==="session"

type StreamItem =
  | { kind: "user"; text: string }                                   // "> …"
  | { kind: "tool"; name: string; running: boolean; ok?: boolean }   // "/ name" / "/ name ✓"
  | { kind: "assistant"; text: string }                              // plain; deltas append

interface AppState {
  screen: Screen
  phase: Phase
  conn: "connecting" | "connected" | "reconnecting"   // → header dot
  sessions: { items: SessionItem[]; active: string | null }
  stream: StreamItem[]                                  // chronological session log
  pending: { transcript: string } | null               // REVIEW buffer, pre-send
  turn: "idle" | "thinking" | "working"                // → agent-state bar
}
```

Reducer rules (pure, TDD'd):

- `transcript{text}` → **only if `phase === "transcribing"`**, set
  `pending = {transcript: text}` and `phase = "review"`. Does **not** modify `stream`.
  If `phase` is anything else (e.g. the recording was cancelled), the transcript is
  **ignored** — this guards the cancel path, where `audio.stop` still makes the bridge
  transcribe and emit a (now-unwanted) `transcript`.
- **confirm** (tap in review) → push `{kind:"user", text: pending.transcript}`, emit
  `text` frame, clear `pending`, `phase = "idle"`, `turn = "thinking"`.
- **redo** (swipe↓ in review) → clear `pending`, `phase = "idle"`.
- `tool.start{name}` → push `{kind:"tool", name, running:true}`, `turn = "working"`.
- `tool.end{name, ok}` → patch the matching trailing tool item to `running:false, ok`.
- `assistant.delta{text}` → append the delta to the trailing `assistant` item, or push
  a new one if the last item isn't assistant. (Assistant text streams as **incremental
  deltas**, not cumulative full-text — a `tool.start` closes the current segment so the
  next delta opens a fresh one, keeping prose and tool lines correctly interleaved.)
- `turn.done` → `turn = "idle"`.
- Recording transitions (`startRecording`/`stopRecording`) set `phase` and are driven
  by the gesture dispatcher, not the socket.

The agent-state bar string is a pure function `barText(state)` derived from
`(phase, turn, pending)`.

### B. Bridge changes (`hermes-evenhub-bridge/server.py`, `protocol.py`)

Two server-side changes:

1. **Decouple transcription from the turn.** Today `audio.stop` transcribes **and**
   immediately runs the turn. New behavior: `audio.stop` → transcribe → emit
   `transcript{text}` **and stop**. The turn runs only when the glasses later send a
   `text` frame (existing handler, unchanged). This is what makes review/redo possible.
2. **Stream incremental deltas.** `_run` currently accumulates `acc` across the whole
   turn and re-sends the cumulative string on every text event, which duplicates prose
   around tool calls. New behavior: send each `text` event as a raw `assistant.delta`
   (no `acc`); the `final` event is not re-sent (the deltas already streamed it).

Covered by pytest: `audio.stop` emits a transcript and does **not** invoke `run_turn`;
a subsequent `text` frame does; and `_run` emits raw `assistant.delta` frames (not
cumulative).

### C. Render (`src/ui/render.ts`, `src/ui/views.ts`)

- **List page:** adapt `buildSessionsPage` to prepend the `＋ New session` row;
  index math accounts for the synthetic row.
- **Session page:** adapt the 3-container page — header = title + dot, body =
  serialized stream, status = agent-state bar.
- **Stream serializer** (new, pure): `streamToText(items): string` applying prefixes
  (`>` / `/` / plain), tool running vs done (`/ name` vs `/ name ✓`), wrapping/tail
  truncation to fit the body height. Unit-tested independently of the SDK.

### D. Gesture dispatch (`src/input/router.ts` already routes; `src/main.ts` dispatches)

`routeEvent` is unchanged (it already normalizes the proto3-omitted click). `main.ts`
replaces its ad-hoc handlers with a state-machine dispatcher keyed on
`(screen, phase)`:

- **list** — `onClick(index)`: index 0 → new session + open; else open
  `sessions.items[index-1]`. `onDoubleClick` → `shutDownPageContainer(1)`.
- **session·idle** — `onClick` → `capture.start()` + `phase="recording"`.
  `onDoubleClick` → back to list. swipe → scroll (v1 may be a no-op).
- **session·recording** — `onClick` → `capture.stop()` + `phase="transcribing"`
  (bar shows `transcribing…`; the resulting `transcript` advances to review).
  `onDoubleClick` → cancel: `capture.stop()` + `phase="idle"` directly; the
  transcript that the bridge still emits is dropped by the reducer's
  `phase==="transcribing"` guard.
- **session·review** — `onClick` → confirm (send). `onScrollDown` → redo.
  `onDoubleClick` → back to list (discard pending).

### E. Lifecycle (refinement, `src/main.ts`)

Align with the input skill: `FOREGROUND_EXIT (5)` → **pause + flush** state to
`setLocalStorage` (do *not* close the socket — glancing away must not drop the
connection). Full teardown (`capture.stop()`, unsubscribe, `audioControl(false)`,
`client.close()`) moves to `SYSTEM_EXIT (7)` and `ABNORMAL_EXIT (6)`, reached via the
list's double-press exit dialog. `beforeunload` remains a backstop.

### Reused unchanged

WS client (reconnect/backoff/failover), ASR PCM pipeline (`audio.start` / binary PCM
/ `audio.stop`), Whisper transcriber, `hermes_client` streaming, all protocol frames
(`hello` / `text` / `audio.*` / `sessions.*` / `tool.*` / `assistant` / `turn.done` /
`transcript`), `serializeLatest` render coalescer, and localStorage URL persistence.

## Testing

TDD throughout (red→green), per the established house pattern.

- **store** (vitest): each transition (list→idle→recording→transcribing→review→idle);
  redo clears `pending` without touching `stream`; confirm pushes a user item + clears
  pending; **cancel guard** — a `transcript` arriving when `phase !== "transcribing"`
  is ignored; tool start/end pairing; assistant delta append vs. new item; `barText`
  derivation across all phases; boot lands on list.
- **stream serializer** (vitest): prefix correctness (`>` / `/` / plain), tool running
  vs done, tail truncation to body height, empty stream.
- **router/dispatch** (vitest): per-state gesture mapping incl. list index → new vs
  open (index 0 special-case), and the proto3-omitted-click still routes.
- **render** (vitest with fake bridge): list page prepends `＋New`; session page sets
  header (title + dot), body (serialized stream), status (bar) with full-replace
  params.
- **bridge** (pytest): `audio.stop` emits `transcript` and does **not** run a turn; a
  following `text` frame runs the turn.
- **on-device:** list / navigation / review are drivable in the simulator with a
  stubbed `transcript` frame (the simulator can't feed PCM). The full voice loop
  (record → Whisper → review → send) is verified on real glasses via `npm run qr`.

## Out of scope (V1)

- Voice confirm/cancel keywords (chose gesture confirm for reliability).
- Live partial transcripts during recording (Whisper transcribes on stop).
- Phone-keyboard text fallback (voice-only).
- Auto-stop on silence / VAD (manual tap-to-stop chosen).
- Bridge-side turn cancellation for the stop gesture (still a v1 no-op).
- Tailscale remote (M5) and packaging (M6.3) are unchanged by this redesign and
  tracked in the existing plan.
