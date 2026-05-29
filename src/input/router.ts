import { OsEventTypeList } from "@evenrealities/even_hub_sdk";
import type { EvenHubEvent } from "@evenrealities/even_hub_sdk";

export interface InputActions {
  onClick: () => void;
  onDoubleClick: () => void;
  onScrollUp: () => void;
  onScrollDown: () => void;
}

export function routeEvent(e: EvenHubEvent, a: InputActions): void {
  const et = e.sysEvent?.eventType ?? e.listEvent?.eventType ?? e.textEvent?.eventType;
  if (et === OsEventTypeList.CLICK_EVENT) a.onClick();
  else if (et === OsEventTypeList.DOUBLE_CLICK_EVENT) a.onDoubleClick();
  else if (et === OsEventTypeList.SCROLL_TOP_EVENT) a.onScrollUp();
  else if (et === OsEventTypeList.SCROLL_BOTTOM_EVENT) a.onScrollDown();
}
