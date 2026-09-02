"use client";

import { BRANDING_PALETTES, matchBrandingPalette } from "@/features/documents/branding-presets";
import { cn } from "@/lib/utils/cn";

export function BrandingPalettePicker({
  colors,
  customOpen,
  onSelect,
  onToggleCustom,
  onCustomChange,
}: {
  colors: {
    primary: string;
    secondary: string;
    headings: string;
    dividers: string;
  };
  customOpen: boolean;
  onSelect: (next: {
    primary: string;
    secondary: string;
    headings: string;
    dividers: string;
  }) => void;
  onToggleCustom: () => void;
  onCustomChange: (key: "primary" | "secondary" | "headings" | "dividers", value: string) => void;
}) {
  const active = matchBrandingPalette(colors);

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">Paleta</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Escolha um conjunto de cores ou personalize.
      </p>
      <div
        role="radiogroup"
        aria-label="Paleta de cores"
        className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {BRANDING_PALETTES.map((palette) => {
          const selected = active === palette.id;
          return (
            <button
              key={palette.id}
              type="button"
              role="radio"
              aria-checked={selected}
              data-testid={`branding-palette-${palette.id}`}
              className={cn(
                "flex min-h-11 flex-col items-start gap-2 rounded-2xl border px-3 py-3 text-left",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                selected
                  ? "border-sage-700 bg-sage-light/70"
                  : "border-border bg-card hover:bg-surface",
              )}
              onClick={() => onSelect(palette.colors)}
            >
              <span className="flex gap-1" aria-hidden>
                <span
                  className="size-4 rounded-full border border-black/10"
                  style={{ background: palette.colors.primary }}
                />
                <span
                  className="size-4 rounded-full border border-black/10"
                  style={{ background: palette.colors.headings }}
                />
                <span
                  className="size-4 rounded-full border border-black/10"
                  style={{ background: palette.colors.dividers }}
                />
              </span>
              <span className="text-xs font-semibold text-foreground">{palette.label}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="mt-3 min-h-11 text-sm font-medium text-sage-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onToggleCustom}
      >
        {customOpen || active === "custom" ? "Ocultar cores individuais" : "Personalizar cores"}
      </button>
      {customOpen || active === "custom" ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["primary", "Principal", colors.primary],
              ["secondary", "Secundária", colors.secondary],
              ["headings", "Títulos", colors.headings],
              ["dividers", "Divisores", colors.dividers],
            ] as const
          ).map(([key, label, value]) => (
            <label key={key} className="flex flex-col gap-1 text-xs text-muted-foreground">
              {label}
              <input
                type="color"
                aria-label={label}
                className="h-11 w-full cursor-pointer rounded-xl border border-border bg-input"
                value={value}
                onChange={(event) => onCustomChange(key, event.target.value)}
              />
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
