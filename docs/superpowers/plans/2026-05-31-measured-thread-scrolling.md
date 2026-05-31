# Measured Thread Scrolling Plan

## Goal

Replace character-budget chat pagination with measured, overlapping text
viewports so a single session thread scrolls consistently on the G2 display.

## Constraints

- The G2 text container API does not expose a continuous scroll offset.
- Session input already routes text-container swipes as app events:
  `scrollUp` means older content and `scrollDown` means newer content.
- The current session layout is structurally sound: header, connection dot,
  body, and status are separate text containers, with the body capturing events.
- The body container is `576x200` with `paddingLength: 4`, leaving a measured
  inner text area of `568x192`.
- The firmware line height is 27px, so the body holds seven wrapped text lines.

## Design

Use a flicker-free simulated scroll:

1. Render the full thread with the existing message markers and banner divider.
2. Wrap the rendered text using `@evenrealities/pretext.measureTextWrap` against
   the body inner width.
3. Build overlapping viewport windows by wrapped line index.
4. Treat `scrollPage: null` as follow-latest mode. Numeric values are measured
   viewport indexes.
5. Move by five wrapped lines per swipe with two lines of visual overlap.
6. Render a compact position suffix in the pinned status line while the thread
   spans multiple viewports.

This keeps the implementation simple and avoids unsupported SDK behavior. It is
not true continuous scrolling; it is deterministic, measured, line-window
scrolling using the only available text update primitive.

## Files

- `src/ui/stream.ts`: measured wrapping, viewport generation, scroll helpers.
- `src/input/dispatch.ts`: clamp scroll movement by measured viewport count.
- `src/ui/views.ts`: render current viewport and status position suffix.
- `tests/stream.test.ts`: viewport capacity, overlap, and scroll helper tests.
- `tests/dispatch.test.ts`: measured viewport scroll behavior.
- `tests/views.test.ts`: status suffix and held viewport rendering.

## Verification

- `npm test`
- `npm run build`
- Bump package/app versions once.
- `npm run pack`
- Submit PR after explicit confirmation for git commit and push.
