import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { type SurfaceTone, toneIconWrapClass } from "@/lib/ui/surface-tone";

export function ToneIcon({
  tone = "neutral",
  children,
  className,
}: {
  tone?: SurfaceTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-[17px]",
        toneIconWrapClass(tone),
        className,
      )}
      aria-hidden
    >
      {children}
    </span>
  );
}
