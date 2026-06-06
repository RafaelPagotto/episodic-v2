export type ProfileDataControlState = {
  message: string;
  redirectTo?: string;
  status: "error" | "idle" | "success";
};

export const INITIAL_PROFILE_DATA_CONTROL_STATE: ProfileDataControlState = {
  message: "",
  status: "idle",
};
