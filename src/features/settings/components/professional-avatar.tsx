import { cn } from "@/lib/utils/cn";

const SIZE_CLASS = {
  sm: "size-10 text-sm",
  md: "size-12 text-base",
  lg: "size-20 text-xl",
  hero: "size-24 text-2xl lg:size-28",
} as const;

export function ProfessionalAvatar({
  name,
  photoUrl,
  size = "md",
}: {
  name: string;
  photoUrl?: string | null;
  size?: keyof typeof SIZE_CLASS;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "P";
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-sage-light/40 font-semibold text-primary",
        SIZE_CLASS[size],
      )}
    >
      {photoUrl ? (
        // Signed URL is short-lived; the alt names the person, not the storage path.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={`Foto de ${name}`} className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initial}</span>
      )}
    </span>
  );
}
