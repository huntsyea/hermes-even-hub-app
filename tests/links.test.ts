import { describe, expect, it } from "vitest";
import { extractLinks, linkRows } from "../src/util/links";
import { dispatch } from "../src/input/dispatch";
import { initialState, type AppState, type StreamItem } from "../src/state/store";
import { reduce } from "../src/state/store";

const stream: StreamItem[] = [
  { kind: "user", text: "compare https://user.example/ignored" },
  { kind: "assistant", text: "See https://example.com/a and (https://example.com/b) again https://example.com/a." },
];

describe("extractLinks", () => {
  it("collects unique links from assistant/banner items only", () => {
    expect(extractLinks(stream)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });
  it("strips trailing punctuation", () => {
    const items: StreamItem[] = [{ kind: "assistant", text: "try https://example.com/x." }];
    expect(extractLinks(items)).toEqual(["https://example.com/x"]);
  });
  it("renders a back row first", () => {
    expect(linkRows([{ url: "https://example.com/a", label: "a" }])[0]).toBe("← back");
  });
});

function sessionWithLinks(): AppState {
  return { ...initialState(), screen: "session", phase: "idle", stream };
}

// Double-tap in session opens the action menu; with links present the rows
// are [← back, 🎤 Speak, 🔗 Links (N), 📚 Sessions].
function enterLinks(s: AppState): AppState {
  const menu = dispatch(s, "doubleClick").state;
  return dispatch(menu, "click", 2).state;
}

describe("menu screen", () => {
  it("double-click in session opens the action menu", () => {
    const r = dispatch(sessionWithLinks(), "doubleClick");
    expect(r.state.screen).toBe("menu");
    expect(r.effects).toEqual([]);
  });
  it("menu speak row starts recording", () => {
    const menu = dispatch(sessionWithLinks(), "doubleClick").state;
    const r = dispatch(menu, "click", 1);
    expect(r.state.screen).toBe("session");
    expect(r.state.phase).toBe("recording");
    expect(r.effects).toEqual([{ kind: "startMic" }]);
  });
  it("menu links row opens the links screen", () => {
    const menu = dispatch(sessionWithLinks(), "doubleClick").state;
    const r = dispatch(menu, "click", 2);
    expect(r.state.screen).toBe("links");
    expect(r.state.links).toHaveLength(2);
  });
  it("menu sessions row goes to the session list (last row without links)", () => {
    const s = { ...initialState(), screen: "session" as const, phase: "idle" as const };
    const menu = dispatch(s, "doubleClick").state;
    const r = dispatch(menu, "click", 2); // [back, speak, sessions]
    expect(r.state.screen).toBe("list");
  });
  it("menu back row returns to the session", () => {
    const menu = dispatch(sessionWithLinks(), "doubleClick").state;
    const r = dispatch(menu, "click", 0);
    expect(r.state.screen).toBe("session");
  });
});

describe("links / page screens", () => {
  it("clicking a link row opens the page and sends page.open", () => {
    const r = dispatch(enterLinks(sessionWithLinks()), "click", 1);
    expect(r.state.screen).toBe("page");
    expect(r.state.page?.url).toBe("https://example.com/a");
    expect(r.state.page?.loading).toBe(true);
    expect(r.effects).toEqual([
      { kind: "send", frame: JSON.stringify({ t: "page.open", url: "https://example.com/a" }) },
    ]);
  });
  it("clicking the back row returns to the session", () => {
    const r = dispatch(enterLinks(sessionWithLinks()), "click", 0);
    expect(r.state.screen).toBe("session");
  });
  it("page.data fills the page state", () => {
    const entered = dispatch(enterLinks(sessionWithLinks()), "click", 1).state;
    const next = reduce(entered, {
      t: "page.data", url: "https://example.com/a", title: "A", text: "hello", images: [], links: [],
    });
    expect(next.page?.loading).toBe(false);
    expect(next.page?.title).toBe("A");
  });
  it("double-click in page view returns to the session", () => {
    const entered = dispatch(enterLinks(sessionWithLinks()), "click", 1).state;
    const r = dispatch(entered, "doubleClick");
    expect(r.state.screen).toBe("session");
    expect(r.state.page).toBeNull();
  });
  it("tap in page view opens that page's links; following pushes history", () => {
    let s = dispatch(enterLinks(sessionWithLinks()), "click", 1).state;
    s = reduce(s, {
      t: "page.data", url: "https://example.com/a", title: "A", text: "hello",
      images: [], links: [{ url: "https://example.com/next", label: "next" }],
    });
    const linksOpen = dispatch(s, "click");
    expect(linksOpen.state.screen).toBe("links");
    expect(linksOpen.state.linksFrom).toBe("page");

    const followed = dispatch(linksOpen.state, "click", 1);
    expect(followed.state.screen).toBe("page");
    expect(followed.state.page?.url).toBe("https://example.com/next");
    expect(followed.state.pageStack).toHaveLength(1);

    const back = dispatch(followed.state, "doubleClick");
    expect(back.state.screen).toBe("page");
    expect(back.state.page?.url).toBe("https://example.com/a");
    expect(back.state.pageStack).toHaveLength(0);

    const exit = dispatch(back.state, "doubleClick");
    expect(exit.state.screen).toBe("session");
  });
  it("page scroll wraps around in both directions", () => {
    let s = dispatch(enterLinks(sessionWithLinks()), "click", 1).state;
    const longText = Array.from({ length: 60 }, (_, i) => `line ${i}`).join("\n");
    s = reduce(s, {
      t: "page.data", url: "https://example.com/a", title: "A", text: longText, images: [], links: [],
    });
    expect(s.page?.page).toBe(0);
    const up = dispatch(s, "scrollUp");
    expect(up.state.page?.page).toBeGreaterThan(0); // wrapped to the last viewport
    const down = dispatch(up.state, "scrollDown");
    expect(down.state.page?.page).toBe(0); // and back around to the first
  });
  it("page.error shows the error and only double-tap escapes", () => {
    let s = dispatch(enterLinks(sessionWithLinks()), "click", 1).state;
    s = reduce(s, { t: "page.error", url: "https://example.com/a", msg: "boom" });
    expect(s.page?.error).toBe("boom");
    expect(dispatch(s, "scrollDown").state).toBe(s); // gestures ignored while errored
    expect(dispatch(s, "click").state).toBe(s);
    const r = dispatch(s, "doubleClick");
    expect(r.state.screen).toBe("session");
  });
  it("back row from page links returns to the page, not the session", () => {
    let s = dispatch(enterLinks(sessionWithLinks()), "click", 1).state;
    s = reduce(s, {
      t: "page.data", url: "https://example.com/a", title: "A", text: "hello",
      images: [], links: [{ url: "https://example.com/next", label: "next" }],
    });
    const linksOpen = dispatch(s, "click").state;
    const r = dispatch(linksOpen, "click", 0);
    expect(r.state.screen).toBe("page");
    expect(r.state.page?.url).toBe("https://example.com/a");
  });
});
