import type { PageImage, PageState } from "../state/store";
import { textPages } from "./stream";

export type PageViewportItem =
  | { kind: "text"; content: string }
  | { kind: "image"; image: PageImage };

// First text page, then images, then the remaining text — long articles would
// otherwise bury the images dozens of scrolls deep. One image per viewport
// (G2 image containers max 288×144; raw-data pushes must stay serial).
export function pageViewports(p: PageState): PageViewportItem[] {
  const text = p.text.trim() ? p.text : "(no text)";
  const pages: PageViewportItem[] = textPages(text).map((content) => ({
    kind: "text",
    content,
  }));
  const images: PageViewportItem[] = p.images.map((image) => ({ kind: "image", image }));
  return [...pages.slice(0, 1), ...images, ...pages.slice(1)];
}
