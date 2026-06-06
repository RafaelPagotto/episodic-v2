export type AuthFormState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Record<string, string>;
};

export const INITIAL_AUTH_FORM_STATE: AuthFormState = {
  status: "idle",
  message: "",
};
