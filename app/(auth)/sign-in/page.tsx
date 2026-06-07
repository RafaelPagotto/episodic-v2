import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { redirectAuthenticatedUser } from "@/features/auth/session";
import type { AuthFormState } from "@/features/auth/state";

type SignInPageProps = {
  searchParams?: Promise<{
    error?: string | string[];
  }>;
};

const AUTH_CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed: "We could not complete sign-in. Please try again.",
  auth_unconfigured: "Authentication is not configured for this deployment.",
  missing_auth_code: "The sign-in link is invalid or expired. Please try again.",
  session_persistence_failed: "We could not save your sign-in session. Please try again.",
};

function getCallbackErrorState(errorParam: string | string[] | undefined): AuthFormState | undefined {
  const errorCode = Array.isArray(errorParam) ? errorParam[0] : errorParam;
  const message = errorCode ? AUTH_CALLBACK_ERROR_MESSAGES[errorCode] : null;

  if (!message) {
    return undefined;
  }

  return {
    message,
    status: "error",
  };
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  await redirectAuthenticatedUser();
  const queryParams = await searchParams;
  const initialState = getCallbackErrorState(queryParams?.error);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Use your account to open your library.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm initialState={initialState} />
      </CardContent>
    </Card>
  );
}
