import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { redirectAuthenticatedUser } from "@/features/auth/session";

export default async function SignUpPage() {
  await redirectAuthenticatedUser();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create account</CardTitle>
        <CardDescription>Start a private show library tied to your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm />
      </CardContent>
    </Card>
  );
}
