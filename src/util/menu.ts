import type { AppState } from "../state/store";
import { extractLinks } from "./links";

export type MenuAction = "back" | "speak" | "links" | "sessions";

export interface MenuItem {
  action: MenuAction;
  label: string;
}

// Session action menu (double-tap). Row order is stable so dispatch and the
// rendered list always agree; "links" appears only when the thread has any.
export function menuItems(s: AppState): MenuItem[] {
  const items: MenuItem[] = [
    { action: "back", label: "← back" },
    { action: "speak", label: "🎤 Speak" },
  ];
  const links = extractLinks(s.stream);
  if (links.length) items.push({ action: "links", label: `🔗 Links (${links.length})` });
  items.push({ action: "sessions", label: "📚 Sessions" });
  return items;
}

export function menuRows(s: AppState): string[] {
  return menuItems(s).map((item) => item.label);
}
