import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { redirectAuthenticatedUser } from "@/features/auth/session";

export default async function SignInPage() {
  await redirectAuthenticatedUser();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Use your account to open your library.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm />
      </CardContent>
    </Card>
  );
}
