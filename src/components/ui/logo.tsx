import Image from "next/image";
import { cn } from "@/lib/utils/cn";

const LOGO_SRC = "/brand/Logo SerenaPsi em Gradiente Sereno(2).png";
const LOGO_INTRINSIC_WIDTH = 1536;
const LOGO_INTRINSIC_HEIGHT = 1024;

export interface LogoProps {
  className?: string;
  width?: number;
  priority?: boolean;
}

/**
 * Renders the official SerenaPsi brand asset exactly as provided.
 * Only the display container may be resized; the source file is never
 * cropped, recolored, vectorized or otherwise transformed.
 */
export function Logo({ className, width = 160, priority = false }: LogoProps) {
  const height = Math.round((width * LOGO_INTRINSIC_HEIGHT) / LOGO_INTRINSIC_WIDTH);

  return (
    <Image
      src={LOGO_SRC}
      alt="SerenaPsi"
      width={LOGO_INTRINSIC_WIDTH}
      height={LOGO_INTRINSIC_HEIGHT}
      priority={priority}
      className={cn("h-auto object-contain", className)}
      style={{ width, height }}
    />
  );
}
