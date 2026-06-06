import type { AuthFormState } from "@/features/auth/state";
import { Notice } from "@/components/ui/notice";

type AuthFormMessageProps = {
  state: AuthFormState;
};

export function AuthFormMessage({ state }: AuthFormMessageProps) {
  if (!state.message) return null;

  return <Notice tone={state.status === "error" ? "error" : "success"}>{state.message}</Notice>;
}
