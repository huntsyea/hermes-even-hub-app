import { describe, it, expect, vi } from "vitest";
import { OsEventTypeList } from "@evenrealities/even_hub_sdk";
import { routeEvent } from "../src/input/router";
import type { InputActions } from "../src/input/router";

function makeActions(): InputActions {
  return {
    onClick: vi.fn(),
    onDoubleClick: vi.fn(),
    onScrollUp: vi.fn(),
    onScrollDown: vi.fn(),
  };
}

describe("routeEvent", () => {
  it("fires onClick for CLICK_EVENT via sysEvent", () => {
    const a = makeActions();
    routeEvent({ sysEvent: { eventType: OsEventTypeList.CLICK_EVENT } } as any, a);
    expect(a.onClick).toHaveBeenCalledOnce();
    expect(a.onDoubleClick).not.toHaveBeenCalled();
    expect(a.onScrollUp).not.toHaveBeenCalled();
    expect(a.onScrollDown).not.toHaveBeenCalled();
  });

  it("fires onClick for a click delivered with eventType omitted (proto3 zero-omission)", () => {
    // Real host/SDK behavior: CLICK_EVENT is enum ordinal 0, which proto3 omits
    // from JSON. The SDK does NOT default it, so sysEvent arrives with only
    // eventSource and no eventType. This must still route to onClick.
    const a = makeActions();
    routeEvent({ sysEvent: { eventSource: 1 } } as any, a);
    expect(a.onClick).toHaveBeenCalledOnce();
    expect(a.onDoubleClick).not.toHaveBeenCalled();
    expect(a.onScrollUp).not.toHaveBeenCalled();
    expect(a.onScrollDown).not.toHaveBeenCalled();
  });

  it("fires onClick with the selected index for a list-item click with eventType omitted", () => {
    const a = makeActions();
    routeEvent({ listEvent: { currentSelectItemIndex: 3 } } as any, a);
    expect(a.onClick).toHaveBeenCalledWith(3);
  });

  it("fires onDoubleClick for DOUBLE_CLICK_EVENT via sysEvent", () => {
    const a = makeActions();
    routeEvent({ sysEvent: { eventType: OsEventTypeList.DOUBLE_CLICK_EVENT } } as any, a);
    expect(a.onDoubleClick).toHaveBeenCalledOnce();
    expect(a.onClick).not.toHaveBeenCalled();
    expect(a.onScrollUp).not.toHaveBeenCalled();
    expect(a.onScrollDown).not.toHaveBeenCalled();
  });

  it("fires onScrollUp for SCROLL_TOP_EVENT via listEvent", () => {
    const a = makeActions();
    routeEvent({ listEvent: { eventType: OsEventTypeList.SCROLL_TOP_EVENT } } as any, a);
    expect(a.onScrollUp).toHaveBeenCalledOnce();
    expect(a.onClick).not.toHaveBeenCalled();
  });

  it("fires onScrollDown for SCROLL_BOTTOM_EVENT via textEvent", () => {
    const a = makeActions();
    routeEvent({ textEvent: { eventType: OsEventTypeList.SCROLL_BOTTOM_EVENT } } as any, a);
    expect(a.onScrollDown).toHaveBeenCalledOnce();
    expect(a.onClick).not.toHaveBeenCalled();
  });

  it("fires nothing for an unrelated event type", () => {
    const a = makeActions();
    // FOREGROUND_ENTER_EVENT = 4, not handled
    routeEvent({ sysEvent: { eventType: OsEventTypeList.FOREGROUND_ENTER_EVENT } } as any, a);
    expect(a.onClick).not.toHaveBeenCalled();
    expect(a.onDoubleClick).not.toHaveBeenCalled();
    expect(a.onScrollUp).not.toHaveBeenCalled();
    expect(a.onScrollDown).not.toHaveBeenCalled();
  });

  it("fires nothing for an empty event (no sub-events)", () => {
    const a = makeActions();
    routeEvent({} as any, a);
    expect(a.onClick).not.toHaveBeenCalled();
    expect(a.onDoubleClick).not.toHaveBeenCalled();
    expect(a.onScrollUp).not.toHaveBeenCalled();
    expect(a.onScrollDown).not.toHaveBeenCalled();
  });

  it("prefers sysEvent over listEvent when both present", () => {
    const a = makeActions();
    routeEvent({
      sysEvent: { eventType: OsEventTypeList.CLICK_EVENT },
      listEvent: { eventType: OsEventTypeList.DOUBLE_CLICK_EVENT },
    } as any, a);
    expect(a.onClick).toHaveBeenCalledOnce();
    expect(a.onDoubleClick).not.toHaveBeenCalled();
  });

  it("routes FOREGROUND_EXIT to onForegroundExit", () => {
    const a = { onClick: vi.fn(), onDoubleClick: vi.fn(), onScrollUp: vi.fn(), onScrollDown: vi.fn(), onForegroundExit: vi.fn(), onForegroundEnter: vi.fn() };
    routeEvent({ sysEvent: { eventType: OsEventTypeList.FOREGROUND_EXIT_EVENT } } as any, a);
    expect(a.onForegroundExit).toHaveBeenCalledOnce();
    expect(a.onClick).not.toHaveBeenCalled();
  });

  it("passes the list selected index to onClick", () => {
    const a = { onClick: vi.fn(), onDoubleClick: vi.fn(), onScrollUp: vi.fn(), onScrollDown: vi.fn() };
    routeEvent({ listEvent: { eventType: OsEventTypeList.CLICK_EVENT, currentSelectItemIndex: 2 } } as any, a);
    expect(a.onClick).toHaveBeenCalledWith(2);
  });

  it("routes FOREGROUND_ENTER to onForegroundEnter", () => {
    const a = { onClick: vi.fn(), onDoubleClick: vi.fn(), onScrollUp: vi.fn(), onScrollDown: vi.fn(), onForegroundExit: vi.fn(), onForegroundEnter: vi.fn() };
    routeEvent({ sysEvent: { eventType: OsEventTypeList.FOREGROUND_ENTER_EVENT } } as any, a);
    expect(a.onForegroundEnter).toHaveBeenCalledOnce();
  });

  it("does not throw when foreground handlers are omitted", () => {
    const a = { onClick: vi.fn(), onDoubleClick: vi.fn(), onScrollUp: vi.fn(), onScrollDown: vi.fn() };
    expect(() => routeEvent({ sysEvent: { eventType: OsEventTypeList.FOREGROUND_EXIT_EVENT } } as any, a)).not.toThrow();
  });
});
