"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type AuthSubmitButtonProps = {
  children: string;
  pendingText: string;
};

export function AuthSubmitButton({ children, pendingText }: AuthSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? pendingText : children}
    </Button>
  );
}
