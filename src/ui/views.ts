import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import type { AppState } from "../state/store";
import { barText, connDot } from "../state/store";
import { IDS, setText, showListPage } from "./render";
import { streamToText } from "./stream";

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
  const title = active ? truncateRow(active.title) : "Hermes";
  await setText(bridge, IDS.header, `${title}  ${connDot(s.conn)}`);

  const body =
    s.phase === "review" && s.pending
      ? `"${s.pending.transcript}"`
      : streamToText(s.stream) || "tap to speak";
  await setText(bridge, IDS.body, body);

  await setText(bridge, IDS.status, barText(s));
}
