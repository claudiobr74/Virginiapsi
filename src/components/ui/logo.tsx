import Image from "next/image";
import { PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils/cn";

export const LOGO_SRC = "/brand/virginia-psi-lockup-transparent.png";
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
 * Official VirgíniaPsi lockup (symbol + wordmark). The display asset is the
 * archived original with only the edge-connected off-white matte converted
 * to alpha. Artwork, colors and dimensions are otherwise unchanged.
 */
export function Logo({
  className,
  width = 200,
  priority = false,
}: LogoProps) {
  const height = Math.round((width * LOGO_INTRINSIC_HEIGHT) / LOGO_INTRINSIC_WIDTH);
  return (
    <div className="brand-surface">
      <Image
        src={LOGO_SRC}
        alt={PRODUCT_NAME}
        width={LOGO_INTRINSIC_WIDTH}
        height={LOGO_INTRINSIC_HEIGHT}
        priority={priority}
        className={cn("brand-mark h-auto max-w-full object-contain", className)}
        style={{ width, height }}
      />
    </div>
  );
}
