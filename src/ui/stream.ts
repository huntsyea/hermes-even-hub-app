import type { StreamItem } from "../state/store";

export function streamToText(items: StreamItem[], maxChars = 400): string {
  const lines = items.map((it) => {
    if (it.kind === "user") return `> ${it.text}`;
    if (it.kind === "tool") return `/ ${it.name}${it.running ? "" : it.ok === false ? " ✗" : " ✓"}`;
    return it.text;
  });
  const text = lines.join("\n");
  if (text.length <= maxChars) return text;
  return "…" + text.slice(text.length - (maxChars - 1));
}
