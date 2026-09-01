import Image from "next/image";
import { PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils/cn";

export const LOGO_SRC = "/brand/virginia-psi-mark.png";
export const LOGO_INTRINSIC_WIDTH = 1536;
export const LOGO_INTRINSIC_HEIGHT = 1024;

export interface LogoProps {
  className?: string;
  width?: number;
  priority?: boolean;
  /** Kept for call-site compatibility. The official PNG is the full lockup. */
  variant?: "mark" | "inline" | "stacked";
}

/**
 * Official VirgíniaPsi lockup (symbol + wordmark), used exactly as provided.
 * Only the display container may be resized; the source file is never
 * cropped, recolored, vectorized or otherwise transformed at render time.
 */
export function Logo({
  className,
  width = 200,
  priority = false,
}: LogoProps) {
  const height = Math.round((width * LOGO_INTRINSIC_HEIGHT) / LOGO_INTRINSIC_WIDTH);
  return (
    <Image
      src={LOGO_SRC}
      alt={PRODUCT_NAME}
      width={LOGO_INTRINSIC_WIDTH}
      height={LOGO_INTRINSIC_HEIGHT}
      priority={priority}
      className={cn("h-auto max-w-full object-contain", className)}
      style={{ width, height }}
    />
  );
}
