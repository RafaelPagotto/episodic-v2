import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { redirectAuthenticatedUser } from "@/features/auth/session";

export default async function ForgotPasswordPage() {
  await redirectAuthenticatedUser();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot password</CardTitle>
        <CardDescription>Send yourself a password reset link.</CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  );
}
