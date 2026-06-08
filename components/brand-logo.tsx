import Image from "next/image";

import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={cn("size-8 shrink-0", className)}
      height={64}
      src="/brand/episodic-logo.svg"
      width={64}
    />
  );
}
