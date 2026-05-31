import { getTextWidth } from "@evenrealities/pretext";
import type { SessionItem } from "../protocol";

export const NEW_SESSION_ROW = "＋ New session";
export const LOADING_SESSIONS_ROW = "loading sessions...";

const LIST_ROW_WIDTH_PX = 576;
const SESSION_HEADER_WIDTH_PX = 540;
const MAX_ITEM_CHARS = 64;
const ELLIPSIS = "…";

function activityTime(updated: number): number {
  return Number.isFinite(updated) ? updated : 0;
}

export function orderedSessions(items: SessionItem[]): SessionItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const byUpdated = activityTime(b.item.updated) - activityTime(a.item.updated);
      return byUpdated || a.index - b.index;
    })
    .map(({ item }) => item);
}

export function sessionForListIndex(items: SessionItem[], index: number): SessionItem | undefined {
  if (index <= 0) return undefined;
  return orderedSessions(items)[index - 1];
}

export function displayTitle(title: string): string {
  return title.trim() || "New session";
}

export function truncateTitle(title: string, maxWidth = SESSION_HEADER_WIDTH_PX, maxChars = MAX_ITEM_CHARS): string {
  const text = displayTitle(title);
  if (fits(text, maxWidth, maxChars)) return text;

  let end = text.length;
  while (end > 0) {
    const candidate = text.slice(0, end).trimEnd() + ELLIPSIS;
    if (fits(candidate, maxWidth, maxChars)) return candidate;
    end--;
  }
  return ELLIPSIS;
}

export function sessionListRows(
  items: SessionItem[],
  active: string | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): string[] {
  return [
    NEW_SESSION_ROW,
    ...orderedSessions(items).map((item) => formatSessionRow(item, active, nowSeconds)),
  ];
}

function formatSessionRow(item: SessionItem, active: string | null, nowSeconds: number): string {
  const marker = item.id === active ? "●" : " ";
  const prefix = `${marker} ${compactAge(item.updated, nowSeconds)} `;
  const title = truncateTitle(
    item.title,
    LIST_ROW_WIDTH_PX - getTextWidth(prefix),
    MAX_ITEM_CHARS - prefix.length,
  );
  return prefix + title;
}

function compactAge(updated: number, nowSeconds: number): string {
  const seconds = activityTime(updated);
  if (seconds <= 0) return "--";

  const elapsed = Math.max(0, nowSeconds - seconds);
  if (elapsed < 60) return "now";
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m`;
  if (elapsed < 86_400) return `${Math.floor(elapsed / 3600)}h`;
  return `${Math.min(99, Math.floor(elapsed / 86_400))}d`;
}

function fits(text: string, maxWidth: number, maxChars: number): boolean {
  return text.length <= maxChars && getTextWidth(text) <= maxWidth;
}
