import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import type { AppState } from "../state/store";
import { barText, connDot } from "../state/store";
import { IDS, setText, showListPage } from "./render";
import { threadPages } from "./stream";

const ROW_CHARS = 48;

export function truncateRow(title: string): string {
  const t = title.trim() || "(untitled)";
  return t.length <= ROW_CHARS ? t : t.slice(0, ROW_CHARS - 1) + "…";
}

export function listRows(s: AppState): string[] {
  return ["＋ New session", ...s.sessions.items.map((i) => truncateRow(i.title))];
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
        : threadPage(s);
  await setText(bridge, IDS.body, body);

  await setText(bridge, IDS.status, barText(s));
}

function threadPage(s: AppState): string {
  const pages = threadPages(s.stream);
  const idx = s.scrollPage === null ? pages.length - 1 : Math.min(s.scrollPage, pages.length - 1);
  return pages[idx] ?? "";
}
