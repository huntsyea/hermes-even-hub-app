# Device-Features Audit — Hermes ↔ G2 Client

**Date:** 2026-05-29
**Scope:** The implemented code audited against the Even Hub `device-features` guidelines — audio capture, IMU, device/user info, local-storage persistence, cleanup-on-exit, and the SDK's hard limits ("what it does NOT expose").
**Files reviewed:** `src/main.ts`, `src/ui/render.ts`, `src/state/store.ts`, `src/net/ws-client.ts`, `src/input/router.ts`.
**Related:** `PLAN-REVIEW-2026-05-29.md`, `UI-AUDIT-2026-05-29.md`. Overlaps are cross-referenced rather than repeated.

Findings only — no source files were modified.

---

## Context

The app currently uses **no hardware features**: no `audioControl`, `imuControl`, `getDeviceInfo`, `getUserInfo`, `onDeviceStatusChanged`, or `setLocalStorage`/`getLocalStorage`. Audio (M4) and persistence (M6.2) are planned but unbuilt. So this audit splits into:

- **Now:** practices the *current* code already violates or gets right (cleanup, startup-result handling, no browser-storage misuse).
- **Forward:** the device-features contract the M4/M6 code must honor when written, captured now so it isn't missed.

---

## TL;DR

| # | Severity | When | One-line |
|---|----------|------|----------|
| D1 | 🔴 High | Now | No hardware/listener cleanup on exit — `onEvenHubEvent` unsubscribe discarded, no `beforeunload`; leaves mic running once M4 lands |
| D2 | 🟡 Medium | Now | `createStartUpPageContainer` result code ignored — audio's prerequisite is **startup success**, but the code proceeds regardless |
| D3 | 🟡 Medium | Forward (M6.2) | Persistence must use `setLocalStorage` — browser `localStorage`/IndexedDB is unreliable in the Flutter WebView |
| D4 | 🟡 Medium | Forward (M4) | Audio capture must follow the start-after-startup / stop-and-unsubscribe pattern + the `audioPcm` type caveat |
| D5 | 🟢 Low | Now | `device: "g2"` hardcoded in the hello frame — could derive from `getDeviceInfo().model` |
| D6 | 🟢 Low | Optional | Device status (battery / wearing / disconnect) unused — `onDeviceStatusChanged` could distinguish glasses-down from bridge-down |
| D7 | 🟢 Low | Now | No programmatic scroll exists in the SDK — confirms `UI-AUDIT` U6 must paginate via rebuild, not scroll position |
| D8 | 🟢 Low | N/A | IMU unused — fine for this app; optional head-gesture nav only |

---

## ✅ Confirmed correct / compliant

- **Startup precedes any hardware call (structurally).** `main.ts:11-12` awaits `waitForEvenAppBridge()` then `buildChatPage()` (which is the `createStartUpPageContainer` call) before subscribing to events. So when M4 adds `audioControl(true)`, the prerequisite ("startup must succeed first") is satisfied by ordering — provided D2 (checking the *result*) is also fixed.
- **No misuse of browser storage.** Nothing currently writes to browser `localStorage`/IndexedDB. That's the correct baseline — the trap is *introducing* it in M6 (see D3), not anything present today.
- **Compliant with the "not exposed" list.** The UI is text-container-only: no speaker/audio-output dependence, no camera, no arbitrary pixel drawing, no animations, no custom fonts/alignment/background. Nothing in the code assumes a capability the SDK doesn't provide. (One implication for the UI: see D7.)

---

## 🔴 D1 — No hardware/listener cleanup on exit (`main.ts`)

**Severity:** High — the device-features guideline calls this out explicitly: *"Failing to do so may leave the microphone or IMU running on the glasses hardware."*

**What the code does.** `main.ts:23`:

```ts
bridge.onEvenHubEvent((e) => routeEvent(e, { ... }));
```

The returned unsubscribe function is **discarded**, and there is no `beforeunload` (or foreground-exit) teardown anywhere. Today the only consequence is a leaked listener (M1 turns no hardware on). But the moment M4 calls `audioControl(true)`, an exit without cleanup leaves the **microphone live on the glasses** — exactly the failure the guideline warns about.

**Fix.** Capture the unsubscribe now and add the teardown hook before audio work begins:

```ts
const off = bridge.onEvenHubEvent((e) => routeEvent(e, { ... }));

window.addEventListener("beforeunload", () => {
  bridge.audioControl(false);   // safe no-op until M4; harmless if mic is already off
  // bridge.imuControl(false);  // only if IMU is ever enabled (see D8)
  off();
});
```

Also route `FOREGROUND_EXIT_EVENT` to the same cleanup (the router doesn't handle it yet — see `UI-AUDIT` U5/U6 and `PLAN-REVIEW` #7), since a user backgrounding the app should stop the mic too, not only a full unload.

**Cross-ref:** `UI-AUDIT` U5 (same root issue, framed from the UI side). This entry is the authoritative device-features statement of it.

---

## 🟡 D2 — `createStartUpPageContainer` result code ignored (`render.ts`)

**Severity:** Medium — turns a recoverable startup failure into silent downstream failures.

**What the guideline says.** *"`createStartUpPageContainer` must succeed before calling `audioControl` or `imuControl`."* Success is a specific return code: `StartUpPageCreateResult.success === 0` (other codes: `1` invalid, `2` oversize, `3` outOfMemory).

**What the code does.** `render.ts:9` awaits the call but **ignores the returned code**, and `main.ts` proceeds unconditionally to subscribe and render. If startup returns non-zero (e.g. oversize/out-of-memory on a constrained device), every subsequent `textContainerUpgrade` — and, in M4, `audioControl` — will fail with no clear cause.

**Fix.** Have `buildChatPage` return/throw on the result and gate boot on it:

```ts
import { StartUpPageCreateResult } from "@evenrealities/even_hub_sdk";

export async function buildChatPage(bridge): Promise<void> {
  const r = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({ ... }));
  if (r !== StartUpPageCreateResult.success) {
    throw new Error(`startup page failed: ${r}`); // 1=invalid 2=oversize 3=outOfMemory
  }
}
```

`boot()` already has a `.catch` (`main.ts:31`), so a thrown failure surfaces in the console instead of cascading into silent render/audio failures.

---

## 🟡 D3 — Persistence must use `setLocalStorage`, not browser storage (M6.2, forward)

**Severity:** Medium — guards against a data-loss trap when M6.2 is implemented.

**What the guideline says.** The Even App is a **Flutter WebView**; browser `localStorage`/IndexedDB **do not reliably persist** across app restarts. Use `bridge.setLocalStorage` / `bridge.getLocalStorage` for all durable state.

**Where it bites.** Plan Task 6.2 wants to *"persist last-good URL + active session via `bridge.setLocalStorage` and restore on boot."* The plan already names the right API — good. This entry exists so the implementer doesn't reach for `window.localStorage` out of habit. State today lives only in `store.ts` (in-memory `AppState`); nothing persists yet, so there's no current bug — only a forward requirement.

**Fix / guidance when building M6.2.**
- Use `bridge.setLocalStorage(key, value)` (values are strings; JSON-encode objects).
- **Debounce** writes and **serialize** them — `setLocalStorage` shares the same BLE link as rendering; concurrent writes during streaming can crash the connection (see `glasses-ui` best practices and `UI-AUDIT` U1). Flush on `turn.done` / page-turn / `beforeunload`, not on every frame.
- Keys are small here (a URL + a session id), so the chunking pattern isn't needed — but keep writes off the streaming hot path.

---

## 🟡 D4 — Audio capture contract for M4 (forward)

**Severity:** Medium — captures the full device-features audio contract so `src/audio/capture.ts` is correct on first write.

**What the guideline requires.**
1. **Order:** `audioControl(true)` only *after* `createStartUpPageContainer` succeeded (D2 makes that check explicit).
2. **Delivery:** PCM arrives via `onEvenHubEvent` as `event.audioEvent.audioPcm`; format **16 kHz, signed 16-bit LE, mono**.
3. **Stop + cleanup:** `audioControl(false)` **and** `unsubscribe()` when the user stops talking and on exit (ties into D1).

**The caveat the guideline understates.** The doc types `audioPcm` as `Uint8Array`, but at runtime it commonly arrives as a **`number[]` or base64 string** (Flutter→JSON serialization). Forwarding it raw as a binary WS frame will transmit garbage. `capture.ts` must normalize to bytes first.

**Cross-ref:** This is the same issue as `PLAN-REVIEW` #1, which carries the `toPcmBytes()` normalization helper and the byte-vs-sample check. Implement `capture.ts` against that helper, and wire its stop path into the D1 cleanup.

**Forward checklist for `capture.ts`:**
- [ ] `audioControl(true)` guarded on startup success
- [ ] normalize `audioPcm` (`number[]`/base64 → `Uint8Array`) before sending
- [ ] `audioControl(false)` + `unsubscribe()` on stop and on exit/foreground-exit
- [ ] never run capture/render/storage bridge calls concurrently (serialize)

---

## 🟢 D5 — `device: "g2"` is hardcoded (`main.ts` / `protocol.ts`)

**Severity:** Low.

The hello frame sends `device: "g2"` literally (`protocol.ts` `hello(...)`, called in `ws-client.ts`). `getDeviceInfo()` exposes the real `model` (`DeviceModel.G2`/`G1`/`Ring1`) and `sn`. Deriving the device string from `getDeviceInfo()` would make the handshake honest and future-proof if a non-G2 ever connects. Minor; only matters if the bridge ever varies behavior by device.

---

## 🟢 D6 — Device status is unused (optional)

**Severity:** Low — UX nicety.

The status line (`views.ts`) reflects only the **WebSocket/bridge** connection (`s.conn`). It never reflects the **glasses** device status. `onDeviceStatusChanged` exposes `isConnected()`, `isWearing`, `batteryLevel`, `isCharging`, `isInCase`. Two worthwhile uses:
- **Disambiguate failures** — distinguish "bridge WS down" from "glasses disconnected/in case," which currently look identical to the user.
- **Gate actions** — e.g. don't arm the mic (M4) when `isWearing === false`.

Optional, not required for correctness.

---

## 🟢 D7 — No programmatic scroll (confirms UI pagination approach)

**Severity:** Low — informational, reinforces a UI decision.

The "not exposed" list includes **no programmatic scroll position** and **no per-item list styling**. This confirms `UI-AUDIT` U6's fix direction: scrolling back through a long reply can't be done by setting a scroll offset on a text container — it must be implemented by **re-rendering a different text slice** (via `textContainerUpgrade` for the same-layout chat body, or `rebuildPageContainer` for the list). Don't design toward a scroll-position API that doesn't exist.

---

## 🟢 D8 — IMU unused (N/A)

**Severity:** None.

The app doesn't use the IMU, which is correct for a chat client. Noted only to record the decision: if head-gesture navigation (e.g. nod to confirm, tilt to switch view) is ever desired, `imuControl(true, ImuReportPace.Pxxx)` + `OsEventTypeList.IMU_DATA_REPORT` filtering is the path — and it would then also need the D1 cleanup (`imuControl(false)`).

---

## Recommended actions

1. **D1** — add the `beforeunload` teardown + capture the unsubscribe **now** (before M4). Smallest change, biggest safety win.
2. **D2** — check the startup result code in `buildChatPage`. One conditional.
3. **D4 / D3** — bake the audio contract and `setLocalStorage` rule into the M4 and M6.2 task work (already partly in the plan; cross-referenced).
4. **D5 / D6 / D7 / D8** — optional polish / already-correct decisions.

---

## Sources

- `everything-evenhub:device-features` skill reference (audio, IMU, device/user info, local storage, cleanup, "not exposed")
- `@evenrealities/even_hub_sdk@0.0.10` type definitions
- Companion docs: `PLAN-REVIEW-2026-05-29.md`, `UI-AUDIT-2026-05-29.md`
- Plan: `docs/superpowers/plans/2026-05-29-hermes-g2-glasses-client.md`
