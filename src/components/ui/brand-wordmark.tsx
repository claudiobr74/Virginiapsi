import { cn } from "@/lib/utils/cn";

export function BrandWordmark({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "font-serif font-bold leading-none tracking-tight",
        size === "sm" && "text-[15px]",
        size === "md" && "text-[22px]",
        size === "lg" && "text-[28px]",
        className,
      )}
    >
      <span className="text-[#1F2A44] dark:text-foreground">Virgínia</span>
      <span className="bg-linear-to-r from-[#C5B4E3] to-[#7B5EA7] bg-clip-text text-transparent">
        Psi
      </span>
    </span>
  );
}
