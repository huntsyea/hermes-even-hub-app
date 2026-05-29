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
  const et = e.sysEvent?.eventType ?? e.listEvent?.eventType ?? e.textEvent?.eventType;
  if (et === OsEventTypeList.CLICK_EVENT) a.onClick(e.listEvent?.currentSelectItemIndex);
  else if (et === OsEventTypeList.DOUBLE_CLICK_EVENT) a.onDoubleClick();
  else if (et === OsEventTypeList.SCROLL_TOP_EVENT) a.onScrollUp();
  else if (et === OsEventTypeList.SCROLL_BOTTOM_EVENT) a.onScrollDown();
  else if (et === OsEventTypeList.FOREGROUND_ENTER_EVENT) a.onForegroundEnter?.();
  else if (et === OsEventTypeList.FOREGROUND_EXIT_EVENT) a.onForegroundExit?.();
}
