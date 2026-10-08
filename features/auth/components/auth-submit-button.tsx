"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type AuthSubmitButtonProps = {
  children: string;
  pendingText: string;
  variant?: "default" | "outline";
  disabled?: boolean;
};

export function AuthSubmitButton({ children, pendingText, variant = "default", disabled = false }: AuthSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full" disabled={pending || disabled} type="submit" variant={variant}>
      {pending ? pendingText : children}
    </Button>
  );
}
