export type TimeZoneActionState = {
  message: string;
  status: "error" | "idle" | "success";
  timeZone?: string;
};

export const INITIAL_TIME_ZONE_ACTION_STATE: TimeZoneActionState = {
  message: "",
  status: "idle",
};
