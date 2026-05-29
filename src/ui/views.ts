import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import type { AppState } from "../state/store";
import { IDS, setText, buildSessionsPage } from "./render";

const BODY_MAX = 400; // approx chars that fit; tuned later on device

// List row inner width ~= 552px (576 - 2*12 firmware item h-padding). pretext
// is not installed, so we char-cap instead of pixel-measuring. The firmware
// font is non-monospaced (~9-11px/char); 48 chars is a conservative fit for
// 552px. (The SDK .d.ts declares no itemName length cap; tune on device.)
const ROW_CHARS = 48;

function truncateRow(title: string): string {
  const t = title.trim() || "(untitled)";
  return t.length <= ROW_CHARS ? t : t.slice(0, ROW_CHARS - 1) + "…";
}

export async function renderChat(bridge: EvenAppBridge, s: AppState): Promise<void> {
  const tail = s.chat.assistant.slice(-BODY_MAX);
  await setText(bridge, IDS.body, tail || s.chat.transcript || "Single-tap to ask");
  const status = s.chat.tool
    ? `${s.chat.tool.emoji ?? "⚙"} ${s.chat.tool.name}${s.chat.tool.running ? "…" : " ✓"}`
    : (s.chat.done ? "✓ done" : s.conn);
  await setText(bridge, IDS.status, status);
}

export async function renderSessions(bridge: EvenAppBridge, s: AppState): Promise<void> {
  // Lists can't be updated in-place — rebuild the whole page (glasses-ui).
  const titles = s.sessions.items.map((i) => truncateRow(i.title));
  await buildSessionsPage(bridge, titles);
}
