"use client";

import type { VisualProfile } from "@/features/documents/contracts";
import { VISUAL_STYLE_COPY, VISUAL_STYLE_ORDER } from "@/features/documents/branding-presets";
import { profileLetterhead } from "@/features/documents/branding-resolve";
import { cn } from "@/lib/utils/cn";

function MiniSheet({ profile }: { profile: VisualProfile }) {
  const letterhead = profileLetterhead(profile);
  const divider = letterhead === "minimalista" ? "h-px bg-neutral-300" : "h-[2px] bg-[#3a4f43]/70";
  const nameWeight = profile === "premium" || profile === "institucional" ? "font-semibold" : "font-normal";
  const clinicSize = profile === "institucional" ? "text-[8px]" : "text-[7px]";
  return (
    <div
      className="mx-auto aspect-[210/297] w-full max-w-[92px] rounded-[3px] border border-neutral-200 bg-white px-2 py-2 text-[#171816] shadow-sm"
      aria-hidden
    >
      {profile !== "essencial" ? (
        <p className={cn("truncate leading-tight text-neutral-500", clinicSize)}>Clínica</p>
      ) : null}
      <p className={cn("truncate text-[8px] leading-tight", nameWeight)}>Profissional</p>
      <p className="truncate text-[6px] text-neutral-500">CRP 00/00000</p>
      <div className={cn("mt-1.5 w-full", divider)} />
      <div className="mt-2 space-y-1">
        <div className="h-1 w-full rounded-full bg-neutral-200" />
        <div className="h-1 w-4/5 rounded-full bg-neutral-200" />
        <div className="h-1 w-3/5 rounded-full bg-neutral-200" />
      </div>
    </div>
  );
}

export function BrandingStylePicker({
  value,
  customized,
  onChange,
}: {
  value: VisualProfile;
  customized?: boolean;
  onChange: (profile: VisualProfile) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">Escolha um estilo</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        O modelo define a hierarquia visual dos documentos.
        {customized ? " Papel timbrado personalizado nas opções avançadas." : null}
      </p>
      <div
        role="radiogroup"
        aria-label="Estilo visual dos documentos"
        className="mt-3 grid grid-cols-2 gap-2"
      >
        {VISUAL_STYLE_ORDER.map((profile) => {
          const copy = VISUAL_STYLE_COPY[profile];
          const selected = value === profile;
          return (
            <button
              key={profile}
              type="button"
              role="radio"
              aria-checked={selected}
              data-testid={`branding-style-${profile}`}
              className={cn(
                "flex min-h-11 flex-col gap-2 rounded-2xl border px-3 py-3 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                selected
                  ? "border-sage-700 bg-sage-light/80 shadow-sm"
                  : "border-border bg-card hover:bg-surface",
              )}
              onClick={() => onChange(profile)}
            >
              <MiniSheet profile={profile} />
              <span className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-foreground">{copy.label}</span>
                  {copy.kicker ? (
                    <span className="rounded-full bg-sage-light px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sage-700">
                      {copy.kicker}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs leading-snug text-muted-foreground">{copy.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
