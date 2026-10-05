import type { AuthFormState } from "@/features/auth/state";
import { ActionFeedback } from "@/components/ui/action-feedback";

type AuthFormMessageProps = {
  state: AuthFormState;
};

export function AuthFormMessage({ state }: AuthFormMessageProps) {
  if (!state.message) return null;

  return (
    <ActionFeedback dismissible feedbackKey={state} presentation="toast" tone={state.status === "error" ? "error" : "success"}>
      {state.message}
    </ActionFeedback>
  );
}
