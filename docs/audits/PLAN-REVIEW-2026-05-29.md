# Plan Review — Hermes ↔ G2 Glasses Client

**Reviewed:** `docs/superpowers/plans/2026-05-29-hermes-g2-glasses-client.md`
**Date:** 2026-05-29
**Scope:** SDK- and audio-dependent claims in the plan, checked against the official Even Hub docs, the `@evenrealities/even_hub_sdk@0.0.10` type definitions, the `device-features` / `sdk-reference` skill references, and the `asr` starter template.

This is a findings document only — the plan itself was **not modified**. Each item lists the severity, what the docs actually say, the affected task, the recommended fix, and how to verify.

---

## TL;DR

- The plan's architecture survives the docs. No structural changes required.
- **Two must-fix bugs** are silent-failure traps as currently written:
  - **#1** — `audioPcm` is not a clean `Uint8Array`; Task 4.4 sends garbage without a normalization step.
  - **#2** — Task 3.1's sessions view violates the one-shot `createStartUpPageContainer` rule; view switching must use `rebuildPageContainer`.
- Three medium de-risking/efficiency wins (**#3–#5**) and two low/already-flagged notes (**#6–#7**).

| # | Severity | Area | Task | One-line |
|---|----------|------|------|----------|
| 1 | 🔴 High | Audio | 4.4 | `audioPcm` arrives as `number[]`/base64, not `Uint8Array` |
| 2 | 🔴 High | UI | 3.1 | View switching must use `rebuildPageContainer`, not a 2nd `createStartUpPageContainer` |
| 3 | 🟡 Medium | Packaging | 1.8 / 5.2 | Confirm `ws://` origins are accepted in the `network` whitelist |
| 4 | 🟡 Medium | Testing | 4.5 | Simulator *can* inject audio — voice path is testable before hardware |
| 5 | 🟡 Medium | Reuse | 4.1 | The `asr` template is a free reference (env + whitelist patterns) |
| 6 | 🟢 Low | UI | 1.8 | `textContainerUpgrade` replace semantics / 2000-char cap |
| 7 | 🟢 Low | Input | 4.4 | Route `FOREGROUND_ENTER/EXIT_EVENT` for mic cleanup |

---

## ✅ Confirmed correct

The docs validate these existing plan decisions — no change needed, listed so they aren't re-litigated:

- **M4 premise** — there is **no native ASR/transcription exposed to third-party apps**. The only audio surface is `audioControl(isOpen)` delivering raw PCM via `audioEvent.audioPcm`. Verified against the SDK type defs, the canonical method reference, and the official developer docs. The native live transcription you see is Even's first-party **Conversate/EvenAI**, which is walled off in the companion app. → Transcription off-glasses (the plan's bridge-side STT) is the only route.
- **PCM format** — Task 4.2's "s16le 16k mono" matches the docs exactly: **PCM, 16 kHz, signed 16-bit little-endian, mono**.
- **`audioControl` ordering** — both `audioControl` and `imuControl` require `createStartUpPageContainer` to have returned success first. The plan calls `buildChatPage` at boot before any audio. Correct.
- **Non-empty whitelist is mandatory** — `evenhub pack` rejects an empty `network` whitelist. Task 1.8 Step 5 already adds one. Good (see #3 for the open sub-question).
- **Exactly one event-capture container** — `buildChatPage` sets `isEventCapture: 1` on only the body container. Correct (zero or >1 is undefined behavior).

---

## 🔴 #1 — `audioPcm` is not a clean `Uint8Array` (Task 4.4)

**Severity:** High — silent corruption, no error thrown.

**What the docs say.** The TypeScript type is `audioPcm: Uint8Array`, but that is not what arrives at runtime. The SDK source comment on the payload reads (translated): *"audioPcm: the host-side `Uint8List`, after JSON, is usually a `number[]` or a base64 string."* The host-push / simulator format in the SDK reference is explicit:

```js
// Audio event — audioPcm is an array of PCM sample integers
{ type: 'listen_even_app_data', method: 'evenHubEvent',
  data: { type: 'audioEvent', jsonData: { audioPcm: [/* numbers */] } } }
```

**Affected plan text.** Task 4.4 Step 1: *"forward `event.audioEvent.audioPcm` as **binary** WS frames."* This assumes raw bytes. If `audioPcm` is a `number[]` or base64 string, the WebSocket will transmit a JSON-stringified array or a text blob, and the bridge's PCM buffer will be garbage — producing empty or nonsense transcripts with no exception.

**Fix.** Normalize in `src/audio/capture.ts` before framing onto the socket. Coerce whatever shows up into `Uint8Array` → send its underlying `ArrayBuffer` as a binary frame:

```typescript
function toPcmBytes(pcm: unknown): Uint8Array {
  if (pcm instanceof Uint8Array) return pcm;
  if (Array.isArray(pcm)) return Uint8Array.from(pcm as number[]); // sample ints (likely already byte-wide)
  if (typeof pcm === "string") {                                   // base64
    const bin = atob(pcm);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  throw new Error("unexpected audioPcm shape: " + typeof pcm);
}
```

> Note: if the `number[]` turns out to be 16-bit samples rather than bytes, `Uint8Array.from` truncates each to 8 bits. Log `audioPcm.length` and the first few values on the first frame to confirm whether you're getting bytes or samples, and adjust (e.g. pack via `Int16Array`) accordingly.

**Verify.** Log the runtime type and length of `audioPcm` on the first received frame. Assert the bridge receives byte counts consistent with 16 kHz × 2 bytes/sample × duration.

---

## 🔴 #2 — Sessions view violates the one-shot `createStartUpPageContainer` rule (Task 3.1)

**Severity:** High — silent no-op (the second page never draws).

**What the docs say.** `createStartUpPageContainer` is **one-shot**: *"call it exactly once at startup; calling it again will not work. Use `rebuildPageContainer` for subsequent full redraws."*

**Affected plan text.** `buildChatPage` (Task 1.8) already spends the one-shot call. Task 3.1 says *"add `buildSessionsPage` using `ListContainerProperty`/`ListItemContainerProperty`"* without specifying how it draws. If `buildSessionsPage` calls `createStartUpPageContainer` again, it silently no-ops and the sessions list never appears.

**Fix.**
- Build **all** containers needed across both views in the single startup call, **or** (cleaner here) keep `buildChatPage` as the one-shot startup and implement view switching via `rebuildPageContainer(new RebuildPageContainer({...}))` — same shape, no `widgetId`.
- The sessions **list container** must carry `isEventCapture: 1` while the sessions view is active (and the chat body's capture flag is moot once torn down). Keep exactly one capture container per drawn page.
- Add `rebuildPageContainer` to `src/ui/render.ts` (e.g. a `buildSessionsPage` that calls `rebuildPageContainer`, and a `buildChatPage`-equivalent rebuild for switching back).

**Verify.** In the simulator, toggle chat → sessions → chat and confirm both render. Watch the console for a silently-ignored second `createStartUpPageContainer`.

---

## 🟡 #3 — Confirm `ws://` origins are accepted in the `network` whitelist (Task 1.8 / 5.2)

**Severity:** Medium — gates both M1 and M5; cheap to check early.

**What the docs say.** The empty-whitelist rejection by `evenhub pack` is documented. The **format** the whitelist accepts is not clearly documented for WebSocket schemes — the examples in the docs are HTTP hosts (for STT providers).

**Affected plan text.** Task 1.8 Step 5 whitelists `ws://192.168.1.100:8765`; Task 5.2 adds `ws://<mac>.<tailnet>.ts.net:8765`. Whether the whitelist accepts the `ws://` scheme, raw IPs, non-standard ports, or expects hosts / `wss://` is unconfirmed.

**Fix / action.** Validate the whitelist format **early** (during M1, not at M5): run `evenhub pack` with the `ws://` entry and do a real sideload to confirm the connection isn't blocked. If `ws://` entries are rejected or ignored, find the accepted form (host-only, `wss://`, etc.) before building the rest of the UI on top of a connection that won't open on-device.

**Verify.** `evenhub pack` succeeds **and** a sideloaded build actually connects to the bridge over LAN (not just the simulator, which may not enforce the whitelist).

---

## 🟡 #4 — The simulator can exercise the voice path (Task 4.5)

**Severity:** Medium — de-risks M4 substantially.

**What the docs say.** The host-push format includes an `audioEvent` injection path (see #1), and the `simulator-automation` skill drives the simulator over its HTTP API.

**Affected plan text.** Task 4.5 Step 1: *"Voice path can't be fully exercised in the simulator (no mic PCM)."* This is too pessimistic.

**Fix / action.** Before hardware testing, feed a **canned PCM buffer** (e.g. a known 16 kHz mono WAV decoded to samples) into the WebView via the `audioEvent` host-push format / simulator automation. This exercises glasses → bridge → STT → reply end-to-end without a physical mic. Reserve the hardware pass (Task 4.5 as written) for validating the **real microphone capture** only.

**Verify.** Injected PCM produces a `transcript` frame containing the expected words, followed by an `assistant`/`turn.done` sequence — all in the simulator.

---

## 🟡 #5 — The `asr` template is a free reference (Task 4.1)

**Severity:** Medium — reuse, not a bug.

**What the docs say.** `/template --asr` scaffolds a *"Mic → STT pipeline with companion UI, double-tap exit. STT provider is a blank stub — user picks their own."* It ships:
- `src/asr/stt.ts` with a `startSttStream()` provider seam,
- `.env.example` → `.env.local` with `VITE_STT_API_KEY`,
- the `network` permission whitelist wiring (provider hosts).

**Relationship to the plan.** The plan deliberately does STT **on the bridge** (Python / `faster-whisper`), not in the glasses app. This is the better choice here — keeps API keys on the Mac, and the mic PCM already flows to the bridge over the WebSocket. So the template is **not** a drop-in, but its env-handling and whitelist patterns are worth cribbing.

**Fix / action.** In Task 4.1's spike, note the `asr` template as the canonical client-side alternative and reference its `.env` / whitelist patterns. Keep the bridge-side architecture.

---

## 🟢 #6 — `textContainerUpgrade` replace semantics (Task 1.8)

**Severity:** Low — the plan already flags confirming field names.

**What the docs say.** `TextContainerUpgrade` has `containerID`, `containerName`, `contentOffset` (where to start writing), `contentLength` (how many chars to replace), and `content` (max **2000** chars per call). It is an in-place update, not necessarily a full clear.

**Affected plan text.** `setText` (Task 1.8 Step 1) passes only `{ containerID, content }`. If the SDK only overwrites the range implied by the new content, **longer prior text may not be cleared**, leaving stale tail characters.

**Fix / action.** Confirm the overwrite behavior. If needed, pass `contentOffset: 0` plus a `contentLength` covering the previous content length to guarantee a full replace. Respect the 2000-char cap (the plan's `BODY_MAX = 400` is well within it).

---

## 🟢 #7 — Route foreground enter/exit events for mic cleanup (Task 4.4)

**Severity:** Low.

**What the docs say.** `OsEventTypeList` includes `FOREGROUND_ENTER_EVENT = 4` and `FOREGROUND_EXIT_EVENT = 5`. The `device-features` skill stresses stopping hardware (`audioControl(false)`) and unsubscribing listeners on exit, or the mic may keep running.

**Affected plan text.** `src/input/router.ts` (Task 1.8) routes click/double-click/scroll only. Task 4.4 wants mic cleanup on foreground-exit, but the router has no path for it.

**Fix / action.** Extend `routeEvent` (and `InputActions`) with `onForegroundEnter` / `onForegroundExit`, and wire `onForegroundExit` → `audioControl(false)` + `audio.stop`. Keep the existing `beforeunload` cleanup as a backstop.

---

## Sources

- Installed SDK type defs — `node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts` (v0.0.10)
- `everything-evenhub:sdk-reference` and `everything-evenhub:device-features` skill references
- `everything-evenhub:template` (`--asr` variant)
- Even Realities developer docs — https://hub.evenrealities.com/docs
- Conversate (first-party live transcription) — https://www.evenrealities.com/conversate , https://support.evenrealities.com/hc/en-us/articles/14273795154319-Conversate
