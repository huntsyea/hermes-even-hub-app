import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import type { AppState } from "../state/store";
import { barText, connDot } from "../state/store";
import { IDS, setText, showListPage } from "./render";
import { sessionListRows, truncateTitle } from "./session-list";
import { currentThreadViewport } from "./stream";

export function truncateRow(title: string): string {
  return truncateTitle(title);
}

export function listRows(s: AppState, nowSeconds?: number): string[] {
  return sessionListRows(s.sessions.items, s.sessions.active, nowSeconds);
}

export async function renderList(bridge: EvenAppBridge, s: AppState): Promise<void> {
  // Lists can't update in place — rebuild the page (glasses-ui).
  await showListPage(bridge, listRows(s));
}

export async function renderSession(bridge: EvenAppBridge, s: AppState): Promise<void> {
  const active = s.sessions.items.find((i) => i.id === s.sessions.active);
  const title = active && active.title.trim() ? truncateRow(active.title) : "Hermes";
  await setText(bridge, IDS.header, title);
  await setText(bridge, IDS.dot, connDot(s.conn));

  const body =
    s.phase === "review" && s.pending
      ? `"${s.pending.transcript}"`
      : s.stream.length === 0
        ? "tap to speak"
        : threadViewportText(s);
  await setText(bridge, IDS.body, body);

  await setText(bridge, IDS.status, statusText(s));
}

function threadViewportText(s: AppState): string {
  return currentThreadViewport(s.stream, s.scrollPage).content;
}

function statusText(s: AppState): string {
  const base = barText(s);
  if (s.phase !== "idle" || s.stream.length === 0) return base;

  const viewport = currentThreadViewport(s.stream, s.scrollPage);
  return viewport.total > 1 ? `${base} · ${viewport.index + 1}/${viewport.total}` : base;
}
