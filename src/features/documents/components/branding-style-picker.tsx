"use client";

import type { VisualProfile } from "@/features/documents/contracts";
import { VISUAL_STYLE_COPY, VISUAL_STYLE_ORDER } from "@/features/documents/branding-presets";
import { getVisualProfileLayout } from "@/features/documents/branding-layout";
import { cn } from "@/lib/utils/cn";

function MiniSheet({ profile }: { profile: VisualProfile }) {
  const layout = getVisualProfileLayout(profile);
  const centered = layout.headerAlignment === "center";
  const titleCentered = layout.titleAlignment === "center";
  return (
    <div
      className="mx-auto aspect-[210/297] w-full max-w-[144px] rounded-[4px] border border-neutral-200 bg-white px-3 py-3 text-[#171816] shadow-sm"
      aria-hidden
    >
      <div className={cn(centered ? "text-center" : "text-left")}>
        <div
          className={cn(
            "mb-1.5 rounded-sm bg-neutral-300",
            profile === "premium" ? "mx-auto h-3 w-8" : profile === "essencial" ? "h-2 w-5" : "h-3 w-9",
          )}
        />
        {profile === "institucional" ? <p className="text-[7px] font-bold">CLÍNICA EXEMPLO</p> : null}
        {profile !== "essencial" ? (
          <p className={cn("text-[7px]", profile === "premium" ? "font-semibold" : "font-normal")}>
            Profissional
          </p>
        ) : (
          <p className="text-[7px]">Profissional · CRP</p>
        )}
        {profile !== "essencial" ? <p className="text-[5px] text-neutral-500">Psicóloga · CRP</p> : null}
      </div>

      {layout.divider !== "none" ? (
        <div
          className={cn(
            "mt-2 bg-neutral-400",
            layout.dividerWidth === "short" ? "mx-auto w-2/5" : "w-full",
            layout.divider === "strong" ? "h-[2px]" : "h-px",
          )}
        />
      ) : (
        <div className="h-3" />
      )}

      <p
        className={cn(
          "mt-3 text-[7px] font-bold",
          titleCentered ? "text-center tracking-[0.12em]" : "text-left",
        )}
      >
        DECLARAÇÃO
      </p>

      <div className={cn("mt-3 space-y-1", profile === "premium" ? "mx-auto w-4/5" : "w-full")}>
        <div className="h-1 w-full rounded-full bg-neutral-200" />
        <div className="h-1 w-full rounded-full bg-neutral-200" />
        <div className="h-1 w-4/5 rounded-full bg-neutral-200" />
        {profile === "institucional" ? <div className="h-1 w-11/12 rounded-full bg-neutral-200" /> : null}
      </div>

      <div
        className={cn(
          "mt-5 w-2/5",
          layout.signatureAlignment === "center" && "mx-auto text-center",
          layout.signatureAlignment === "right" && "ml-auto text-right",
          layout.signatureAlignment === "left" && "mr-auto text-left",
        )}
      >
        {profile !== "essencial" ? <div className="mb-1 h-px bg-neutral-300" /> : null}
        <div className="h-1 w-full rounded-full bg-neutral-200" />
        <div className="mt-1 h-1 w-3/4 rounded-full bg-neutral-100" />
      </div>

      <div className="mt-auto pt-4">
        {profile !== "essencial" ? <div className="mb-1 h-px bg-neutral-200" /> : null}
        <div className={cn("mx-auto h-1 rounded-full bg-neutral-100", profile === "institucional" ? "w-full" : "w-2/3")} />
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
        Padrão dos documentos. Cada estilo define uma composição diferente para cabeçalho, título, margens,
        assinatura e rodapé.
        {customized ? " Papel timbrado personalizado nas opções avançadas." : null}
      </p>
      <div
        role="radiogroup"
        aria-label="Estilo visual dos documentos"
        className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {VISUAL_STYLE_ORDER.map((profile, index) => {
          const copy = VISUAL_STYLE_COPY[profile];
          const selected = value === profile;
          return (
            <button
              key={profile}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              data-testid={`branding-style-${profile}`}
              className={cn(
                "flex min-h-11 flex-col gap-3 rounded-2xl border px-3 py-3 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                selected
                  ? "border-sage-700 bg-sage-light/80 shadow-sm"
                  : "border-border bg-card hover:bg-surface",
              )}
              onClick={() => onChange(profile)}
              onKeyDown={(event) => {
                const last = VISUAL_STYLE_ORDER.length - 1;
                let nextIndex = index;
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  nextIndex = index === last ? 0 : index + 1;
                } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                  nextIndex = index === 0 ? last : index - 1;
                } else if (event.key === "Home") {
                  nextIndex = 0;
                } else if (event.key === "End") {
                  nextIndex = last;
                } else {
                  return;
                }
                event.preventDefault();
                const next = VISUAL_STYLE_ORDER[nextIndex];
                onChange(next);
                queueMicrotask(() => {
                  document
                    .querySelector<HTMLButtonElement>(`[data-testid="branding-style-${next}"]`)
                    ?.focus();
                });
              }}
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
