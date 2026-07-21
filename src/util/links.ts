import type { PageLink, StreamItem } from "../state/store";

// Trailing punctuation is stripped so "…see https://a.b/c." links cleanly.
const URL_RE = /https?:\/\/[^\s)\]>"'`]+/g;
const MAX_LINKS = 19; // list widget shows 20 rows; row 0 is "← back"
const ROW_MAX_CHARS = 40;

export function extractLinks(items: StreamItem[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    if (it.kind !== "assistant" && it.kind !== "banner") continue;
    for (const raw of it.text.match(URL_RE) ?? []) {
      const url = raw.replace(/[.,;:!?、。]+$/, "");
      if (!seen.has(url)) {
        seen.add(url);
        out.push(url);
        if (out.length >= MAX_LINKS) return out;
      }
    }
  }
  return out;
}

export function toPageLinks(urls: string[]): PageLink[] {
  return urls.map((url) => ({ url, label: shortLink(url) }));
}

export function linkRows(links: PageLink[]): string[] {
  return ["← back", ...links.map((l) => truncate(l.label || shortLink(l.url), ROW_MAX_CHARS))];
}

function shortLink(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    return truncate(`${u.host}${path}`, ROW_MAX_CHARS);
  } catch {
    return truncate(url, ROW_MAX_CHARS);
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
