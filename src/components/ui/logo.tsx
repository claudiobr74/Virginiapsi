import Image from "next/image";
import { BrandWordmark } from "@/components/ui/brand-wordmark";
import { PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils/cn";

export const LOGO_SRC = "/brand/virginia-psi-mark.png";
export const LOGO_INTRINSIC_WIDTH = 701;
export const LOGO_INTRINSIC_HEIGHT = 523;

export interface LogoProps {
  className?: string;
  width?: number;
  priority?: boolean;
  variant?: "mark" | "inline" | "stacked";
}

/**
 * Official VirgíniaPsi mark (Psi in teal/lavender leaves).
 * Only the display container may be resized; the source file is never
 * cropped, recolored, vectorized or otherwise transformed at render time.
 */
export function Logo({
  className,
  width = 160,
  priority = false,
  variant = "mark",
}: LogoProps) {
  const height = Math.round((width * LOGO_INTRINSIC_HEIGHT) / LOGO_INTRINSIC_WIDTH);
  const mark = (
    <Image
      src={LOGO_SRC}
      alt={PRODUCT_NAME}
      width={LOGO_INTRINSIC_WIDTH}
      height={LOGO_INTRINSIC_HEIGHT}
      priority={priority}
      className={cn("h-auto object-contain", variant === "mark" && className)}
      style={{ width, height }}
    />
  );

  if (variant === "inline") {
    return (
      <span className={cn("inline-flex items-center gap-2", className)}>
        {mark}
        <BrandWordmark size={width <= 36 ? "sm" : "md"} />
      </span>
    );
  }

  if (variant === "stacked") {
    return (
      <span className={cn("inline-flex flex-col items-center gap-3", className)}>
        {mark}
        <BrandWordmark size="lg" />
      </span>
    );
  }

  return mark;
}
