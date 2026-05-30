import { OsEventTypeList } from "@evenrealities/even_hub_sdk";
import type { EvenHubEvent } from "@evenrealities/even_hub_sdk";

export interface InputActions {
  onClick: (index?: number) => void;
  onDoubleClick: () => void;
  onScrollUp: () => void;
  onScrollDown: () => void;
  onForegroundEnter?: () => void;
  onForegroundExit?: () => void;
}

export function routeEvent(e: EvenHubEvent, a: InputActions): void {
  // Pick whichever event object the host populated (these are mutually exclusive
  // per EvenHubEventType). CLICK_EVENT is enum ordinal 0, which the host omits
  // from JSON (proto3 drops zero-valued scalars) and the SDK does NOT default —
  // so a present event with no eventType IS a click. Every other event type is
  // non-zero and arrives with its eventType set.
  const src = e.sysEvent ?? e.listEvent ?? e.textEvent;
  if (!src) return;
  const et = src.eventType ?? OsEventTypeList.CLICK_EVENT;
  if (et === OsEventTypeList.CLICK_EVENT) a.onClick(e.listEvent?.currentSelectItemIndex);
  else if (et === OsEventTypeList.DOUBLE_CLICK_EVENT) a.onDoubleClick();
  else if (et === OsEventTypeList.SCROLL_TOP_EVENT) a.onScrollUp();
  else if (et === OsEventTypeList.SCROLL_BOTTOM_EVENT) a.onScrollDown();
  else if (et === OsEventTypeList.FOREGROUND_ENTER_EVENT) a.onForegroundEnter?.();
  else if (et === OsEventTypeList.FOREGROUND_EXIT_EVENT) a.onForegroundExit?.();
}
