import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import type { AppState } from "../state/store";
import { IDS, setText } from "./render";

const BODY_MAX = 400; // approx chars that fit; tuned later on device

export async function renderChat(bridge: EvenAppBridge, s: AppState): Promise<void> {
  const tail = s.chat.assistant.slice(-BODY_MAX);
  await setText(bridge, IDS.body, tail || s.chat.transcript || "Single-tap to ask");
  const status = s.chat.tool
    ? `${s.chat.tool.emoji ?? "⚙"} ${s.chat.tool.name}${s.chat.tool.running ? "…" : " ✓"}`
    : (s.chat.done ? "✓ done" : s.conn);
  await setText(bridge, IDS.status, status);
}
