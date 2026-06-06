import { DISPLAY_STATUS_LABELS } from "../library/view-model";
import type { DisplayStatus } from "../tracking";

export function getProgressStatusLabel(displayStatus: DisplayStatus) {
  return DISPLAY_STATUS_LABELS[displayStatus];
}
