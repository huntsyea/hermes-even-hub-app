import type { StreamItem } from "../state/store";

// 26 box-drawing chars = 520px; body usable width is 568px (one ─ = 20px,
// measured via @evenrealities/pretext). 40 chars (800px) wrapped to 2 lines.
const RULE = "─".repeat(26);

function renderItem(it: StreamItem): string {
  if (it.kind === "user") return `> ${it.text}`;
  if (it.kind === "tool") return `▸ ${it.name}${it.running ? "" : it.ok === false ? " ✗" : " ✓"}`;
  if (it.kind === "banner") {
    const body = it.text.split("\n").map((l) => ` ${l}`).join("\n");
    return `${RULE}\n${body}\n${RULE}`;
  }
  return it.text; // assistant
}

// Items join with "\n"; an extra blank line separates everything EXCEPT two
// adjacent tool calls, so a multi-tool run reads as one tight block while a
// tool group is visually broken away from the agent text around it.
export function streamToText(items: StreamItem[]): string {
  let out = "";
  for (let i = 0; i < items.length; i++) {
    if (i > 0) {
      const tightTools = items[i - 1].kind === "tool" && items[i].kind === "tool";
      out += tightTools ? "\n" : "\n\n";
    }
    out += renderItem(items[i]);
  }
  return out;
}

// Pre-paginate at a char budget on line boundaries (firmware font is not
// monospaced, so exact line measurement is unreliable; char budget is
// deterministic and testable). Always returns at least one page.
export function paginate(text: string, pageChars = 360): string[] {
  const rawLines = text.split("\n");
  const lines: string[] = [];
  for (const ln of rawLines) {
    if (ln.length <= pageChars) lines.push(ln);
    else for (let i = 0; i < ln.length; i += pageChars) lines.push(ln.slice(i, i + pageChars));
  }
  const pages: string[] = [];
  let cur: string[] = [];
  let len = 0;
  const flush = () => {
    while (cur[0] === "") cur.shift();
    while (cur.length && cur[cur.length - 1] === "") cur.pop();
    pages.push(cur.join("\n"));
    cur = [];
    len = 0;
  };
  for (const ln of lines) {
    const sep = cur.length ? 1 : 0;
    if (cur.length && len + sep + ln.length > pageChars) flush();
    len += (cur.length ? 1 : 0) + ln.length;
    cur.push(ln);
  }
  flush();
  return pages;
}

export function threadPages(items: StreamItem[], pageChars = 360): string[] {
  return paginate(streamToText(items), pageChars);
}
