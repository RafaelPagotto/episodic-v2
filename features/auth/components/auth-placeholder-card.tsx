import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AuthPlaceholderCardProps = {
  title: string;
  description: string;
};

export function AuthPlaceholderCard({ title, description }: AuthPlaceholderCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Link className="text-sm font-medium text-primary hover:underline" href="/library">
          Continue to app shell
        </Link>
      </CardContent>
    </Card>
  );
}
