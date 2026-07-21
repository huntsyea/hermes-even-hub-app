import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import type { AppState, StreamItem } from "../state/store";
import { barText, connDot, isHistoryLoading } from "../state/store";
import {
  IDS, pushPageImage, setText, showListPage, showLoadingPage,
  showPageImageLayout, showSessionPage,
} from "./render";
import { LOADING_SESSIONS_ROW, sessionListRows, truncateTitle } from "./session-list";
import { currentThreadViewport } from "./stream";
import { pageViewports } from "./page-view";

export function truncateRow(title: string): string {
  return truncateTitle(title);
}

export function listRows(s: AppState, nowSeconds?: number): string[] {
  if (!s.sessionsLoaded) return [LOADING_SESSIONS_ROW];
  return sessionListRows(s.sessions.items, s.sessions.active, nowSeconds);
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

// Page view rebuilds layout only when crossing text↔image (or on entry);
// text→text renders update container content in place.
let pageLayout: "none" | "text" | "image" = "none";
export function resetPageLayout(): void {
  pageLayout = "none";
}

export async function renderPage(bridge: EvenAppBridge, s: AppState): Promise<void> {
  const p = s.page;
  if (!p) return;
  const host = pageHost(p.url);
  const title = p.title.trim() ? truncateRow(p.title) : host;

  if (p.loading || p.error) {
    await ensurePageTextLayout(bridge);
    await setText(bridge, IDS.header, title);
    await setText(bridge, IDS.dot, "◌");
    await setText(bridge, IDS.body, p.error ? `error:\n${p.error}` : `loading page…\n${host}`);
    await setText(bridge, IDS.status, "dbl-tap = back");
    return;
  }

  const viewports = pageViewports(p);
  const index = Math.min(Math.max(p.page, 0), viewports.length - 1);
  const vp = viewports[index];
  const position = `${index + 1}/${viewports.length}`;

  const linksHint = p.links.length ? ` · tap = ${p.links.length} links` : "";

  if (vp.kind === "text") {
    await ensurePageTextLayout(bridge);
    await setText(bridge, IDS.header, title);
    await setText(bridge, IDS.dot, "●");
    await setText(bridge, IDS.body, vp.content);
    await setText(bridge, IDS.status, `${position} · ${host}${linksHint} · dbl-tap = back`);
    return;
  }

  // Image viewports rebuild every time: the container is sized per image.
  await showPageImageLayout(bridge, vp.image.width, vp.image.height);
  pageLayout = "image";
  await setText(bridge, IDS.header, title);
  const result = await pushPageImage(bridge, vp.image.data);
  const label = result === "success" ? "image" : `img err: ${result}`;
  await setText(bridge, IDS.status, `${position} · ${label}${linksHint} · dbl-tap = back`);
}

async function ensurePageTextLayout(bridge: EvenAppBridge): Promise<void> {
  if (pageLayout !== "text") {
    await showSessionPage(bridge);
    pageLayout = "text";
  }
}

function pageHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
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
