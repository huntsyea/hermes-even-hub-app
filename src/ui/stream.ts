import type { StreamItem } from "../state/store";
import { getTextWidth, measureTextWrap } from "@evenrealities/pretext";

// 26 box-drawing chars = 520px; body usable width is 568px (one ─ = 20px,
// measured via @evenrealities/pretext). 40 chars (800px) wrapped to 2 lines.
const RULE = "─".repeat(26);

export const THREAD_BODY = {
  width: 576,
  height: 200,
  padding: 4,
  lineHeight: 27,
  overlapLines: 2,
} as const;

export const THREAD_BODY_INNER_WIDTH = THREAD_BODY.width - 2 * THREAD_BODY.padding;
export const THREAD_BODY_INNER_HEIGHT = THREAD_BODY.height - 2 * THREAD_BODY.padding;
export const THREAD_VIEWPORT_LINES = Math.floor(THREAD_BODY_INNER_HEIGHT / THREAD_BODY.lineHeight);
export const THREAD_SCROLL_STRIDE_LINES = THREAD_VIEWPORT_LINES - THREAD_BODY.overlapLines;

export interface ThreadViewport {
  index: number;
  total: number;
  startLine: number;
  endLine: number;
  content: string;
}

function renderItem(it: StreamItem): string {
  if (it.kind === "user") return `> ${it.text}`;
  if (it.kind === "tool") {
    const label = it.label?.trim() || it.name;
    return `/ ${label}${it.running ? "" : it.ok === false ? " fail" : " ok"}`;
  }
  if (it.kind === "banner") {
    const body = it.text.split("\n").map((l) => ` ${l}`).join("\n");
    return `${RULE}\n${body}\n${RULE}`;
  }
  return it.text; // assistant
}

export function streamToText(items: StreamItem[]): string {
  return items.map(renderItem).join("\n");
}

export function wrapTextLines(text: string, maxWidth = THREAD_BODY_INNER_WIDTH): string[] {
  const lines = text.split("\n").flatMap((line) => wrapExplicitLine(line, maxWidth));
  return lines.length ? lines : [""];
}

export function threadViewports(items: StreamItem[]): ThreadViewport[] {
  return viewportsForText(streamToText(items));
}

export function threadPages(items: StreamItem[]): string[] {
  return threadViewports(items).map((viewport) => viewport.content);
}

export function currentThreadViewport(items: StreamItem[], scrollPage: number | null): ThreadViewport {
  const viewports = threadViewports(items);
  const idx = scrollPage === null ? viewports.length - 1 : clampIndex(scrollPage, viewports.length);
  return viewports[idx] ?? emptyViewport();
}

export function previousThreadViewportIndex(items: StreamItem[], scrollPage: number | null): number | null {
  const viewports = threadViewports(items);
  if (viewports.length <= 1) return null;
  const current = scrollPage === null ? viewports.length - 1 : clampIndex(scrollPage, viewports.length);
  return current === 0 ? 0 : current - 1;
}

export function nextThreadViewportCursor(items: StreamItem[], scrollPage: number | null): number | null {
  if (scrollPage === null) return null;
  const viewports = threadViewports(items);
  const next = clampIndex(scrollPage, viewports.length) + 1;
  return next >= viewports.length - 1 ? null : next;
}

/**
 * The SDK rejects text over ~999 bytes on `rebuildPageContainer` and
 * `textContainerUpgrade`, and it fails SILENTLY — it resolves `false`, throws
 * nothing, logs nothing, and the screen simply does not update. That is
 * indistinguishable from a stale render, which is what makes it expensive to
 * diagnose.
 *
 * Wrapping here is by PIXEL width, which does not bound UTF-8 byte length: a
 * viewport of non-ASCII text can be correctly sized on screen and still bust the
 * budget. Any assistant reply containing CJK, Cyrillic or accented text can hit
 * it, and when it does the thread stops updating with no error anywhere.
 */
export const VIEWPORT_BYTE_BUDGET = 960;
const utf8 = new TextEncoder();

export function byteLength(text: string): number {
  return utf8.encode(text).length;
}

/** Trim one line to a byte budget without splitting a UTF-8 sequence. */
function clampLineBytes(line: string, maxBytes: number): string {
  if (byteLength(line) <= maxBytes) return line;
  const chars = Array.from(line);
  while (chars.length && byteLength(chars.join("") + "…") > maxBytes) chars.pop();
  return chars.join("") + "…";
}

/**
 * Fit lines into the budget, dropping from the FRONT so the newest text
 * survives — and capping each surviving line too, because a single unwrapped
 * line can exceed the budget on its own, which a drop-from-front loop alone
 * would still ship.
 */
export function clampToBudget(lines: string[], maxBytes = VIEWPORT_BYTE_BUDGET): string {
  const capped = lines.map((l) => clampLineBytes(l, maxBytes));
  let start = 0;
  while (start < capped.length - 1 && byteLength(capped.slice(start).join("\n")) > maxBytes) start++;
  return capped.slice(start).join("\n");
}

function viewportsForText(text: string): ThreadViewport[] {
  const lines = wrapTextLines(text);
  const starts = viewportStarts(lines.length);
  const total = starts.length;
  return starts.map((startLine, index) => {
    const endLine = Math.min(startLine + THREAD_VIEWPORT_LINES, lines.length);
    return {
      index,
      total,
      startLine,
      endLine,
      content: clampToBudget(lines.slice(startLine, endLine)),
    };
  });
}

function viewportStarts(lineCount: number): number[] {
  if (lineCount <= THREAD_VIEWPORT_LINES) return [0];

  const starts: number[] = [];
  const stride = Math.max(1, THREAD_SCROLL_STRIDE_LINES);
  const lastStart = lineCount - THREAD_VIEWPORT_LINES;
  for (let start = 0; start < lastStart; start += stride) starts.push(start);
  if (starts[starts.length - 1] !== lastStart) starts.push(lastStart);
  return starts;
}

function wrapExplicitLine(line: string, maxWidth: number): string[] {
  if (line === "") return [""];
  if (fitsOneMeasuredLine(line, maxWidth)) return [line];

  const tokens = line.match(/\S+\s*/g) ?? [line];
  const wrapped: string[] = [];
  let current = "";

  for (const token of tokens) {
    const candidate = current + token;
    if (current && !fitsOneMeasuredLine(candidate.trimEnd(), maxWidth)) {
      wrapped.push(current.trimEnd());
      current = "";
    }

    if (!fitsOneMeasuredLine(token.trimEnd(), maxWidth)) {
      const split = splitLongToken(token.trimEnd(), maxWidth);
      if (current) {
        wrapped.push(current.trimEnd());
        current = "";
      }
      wrapped.push(...split.slice(0, -1));
      current = split[split.length - 1] ?? "";
      continue;
    }

    current += token;
  }

  if (current || wrapped.length === 0) wrapped.push(current.trimEnd());
  return wrapped;
}

function fitsOneMeasuredLine(text: string, maxWidth: number): boolean {
  return measureTextWrap(text, maxWidth).lineCount <= 1;
}

function splitLongToken(token: string, maxWidth: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const char of Array.from(token)) {
    const candidate = current + char;
    if (current && getTextWidth(candidate) > maxWidth) {
      parts.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function clampIndex(index: number, total: number): number {
  return Math.max(0, Math.min(index, total - 1));
}

function emptyViewport(): ThreadViewport {
  return { index: 0, total: 1, startLine: 0, endLine: 0, content: "" };
}
