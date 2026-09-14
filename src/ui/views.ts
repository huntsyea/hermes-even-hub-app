import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import type { AppState, StreamItem } from "../state/store";
import { barText, connDot, isHistoryLoading } from "../state/store";
import { IDS, setText, showListPage, showLoadingPage } from "./render";
import { LOADING_SESSIONS_ROW, orderedSessions, sessionListRows, truncateTitle } from "./session-list";
import { currentThreadViewport } from "./stream";

export function truncateRow(title: string): string {
  return truncateTitle(title);
}

/**
 * What is on screen, and what each row MEANS.
 *
 * `rows` and `ids` are built together and must stay together: the glasses report
 * a tap as an INDEX into the rows they are currently displaying, and the session
 * list re-sorts by recency underneath us every time a `sessions` frame arrives.
 * Re-deriving the mapping from live state at tap time therefore opens whatever
 * sits at that index NOW, which after any reorder is not the row the wearer
 * touched.
 *
 * `ids[i]` is the session for row `i`, or null for the ＋New row.
 */
export interface ListView {
  rows: string[];
  ids: (string | null)[];
}

export function buildListView(s: AppState, nowSeconds?: number): ListView {
  if (!s.sessionsLoaded) return { rows: [LOADING_SESSIONS_ROW], ids: [null] };
  return {
    rows: sessionListRows(s.sessions.items, s.sessions.active, nowSeconds),
    ids: [null, ...orderedSessions(s.sessions.items).map((i) => i.id)],
  };
}

export function listRows(s: AppState, nowSeconds?: number): string[] {
  return buildListView(s, nowSeconds).rows;
}

export async function renderList(bridge: EvenAppBridge, s: AppState): Promise<void> {
  if (!s.sessionsLoaded) {
    await showLoadingPage(bridge, loadingText(s));
    return;
  }
  // Lists can't update in place — rebuild the page (glasses-ui).
  await showListPage(bridge, listRows(s));
}

export function loadingText(s: AppState): string {
  const status = s.conn === "connected"
    ? "waiting for session list"
    : s.conn;
  return `loading sessions...\n${status}`;
}

export async function renderSession(bridge: EvenAppBridge, s: AppState): Promise<void> {
  const active = s.sessions.items.find((i) => i.id === s.sessions.active);
  const title = active && active.title.trim() ? truncateRow(active.title) : "Hermes";
  await setText(bridge, IDS.header, title);
  await setText(bridge, IDS.dot, connDot(s.conn));

  const body = isHistoryLoading(s)
    ? "loading session..."
    : displayThreadItems(s).length === 0
      ? "tap to speak"
      : threadViewportText(s);
  await setText(bridge, IDS.body, body);

  await setText(bridge, IDS.status, statusText(s));
}

function threadViewportText(s: AppState): string {
  return currentThreadViewport(displayThreadItems(s), s.scrollPage).content;
}

function displayThreadItems(s: AppState): StreamItem[] {
  if (s.phase === "review" && s.pending) {
    return [...s.stream, { kind: "user", text: s.pending.transcript }];
  }
  return s.stream;
}

function statusText(s: AppState): string {
  const base = barText(s);
  const items = displayThreadItems(s);
  if (s.phase !== "idle" || items.length === 0) return base;

  const viewport = currentThreadViewport(items, s.scrollPage);
  return viewport.total > 1 ? `${base} · ${viewport.index + 1}/${viewport.total}` : base;
}
