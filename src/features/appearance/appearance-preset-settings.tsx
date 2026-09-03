"use client";

import { Check, MonitorSmartphone } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { updateAppearancePresetAction } from "@/features/appearance/actions";
import {
  APPEARANCE_PRESET_OPTIONS,
  applyAppearancePreset,
  type AppearancePreset,
} from "@/features/appearance/appearance-presets";
import { cn } from "@/lib/utils/cn";

function PresetMiniature({ preset }: { preset: AppearancePreset }) {
  return (
    <div data-preview-preset={preset} className="preset-miniature overflow-hidden rounded-[18px] border p-3 text-left">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="preset-miniature-title text-[10px] font-semibold uppercase tracking-[0.12em]">Meu Dia</p>
          <p className="preset-miniature-heading mt-0.5 text-sm font-semibold">Bom dia, Virgínia</p>
        </div>
        <span className="preset-miniature-dot size-3 rounded-full" />
      </div>
      <div className="preset-miniature-card rounded-xl border p-2.5">
        <p className="preset-miniature-muted text-[9px] font-semibold uppercase tracking-wide">Próximo atendimento</p>
        <p className="preset-miniature-heading mt-1 text-xs font-semibold">10:30 · Paciente</p>
        <div className="mt-2 flex gap-1.5">
          <span className="preset-miniature-button rounded-md px-2 py-1 text-[9px] font-semibold">Atender</span>
          <span className="preset-miniature-chip rounded-md px-2 py-1 text-[9px]">Prontuário</span>
        </div>
      </div>
    </div>
  );
}

export function AppearancePresetSettings({
  children,
  initialPreset,
  initialTab,
}: {
  children: ReactNode;
  initialPreset: AppearancePreset;
  initialTab?: string;
}) {
  const [appearanceActive, setAppearanceActive] = useState(initialTab === "appearance");
  const [selected, setSelected] = useState<AppearancePreset>(initialPreset);
  const savedPreset = useRef(initialPreset);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    savedPreset.current = initialPreset;
    setSelected(initialPreset);
    applyAppearancePreset(initialPreset);
  }, [initialPreset]);

  useEffect(() => {
    return () => applyAppearancePreset(savedPreset.current);
  }, []);

  function choose(preset: AppearancePreset) {
    setSelected(preset);
    setMessage(null);
    applyAppearancePreset(preset);
  }

  return (
    <div
      onClickCapture={(event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const tab = target.closest('[role="tab"]');
        if (!(tab instanceof HTMLElement)) return;
        setAppearanceActive(tab.textContent?.trim() === "Aparência");
      }}
    >
      {children}

      {appearanceActive ? (
        <Card tone="settings" className="mt-6 lg:ml-[calc(16.25rem+1.5rem)]">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <MonitorSmartphone className="size-4" aria-hidden />
                <p className="text-xs font-bold uppercase tracking-wide">Estilo do VirgíniaPsi</p>
              </div>
              <h2 className="mt-1 font-serif text-xl font-semibold text-foreground">Escolha a atmosfera visual</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                O estilo é compartilhado com a equipe. Claro, escuro ou sistema continuam sendo uma preferência deste dispositivo.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Estilo do VirgíniaPsi">
            {APPEARANCE_PRESET_OPTIONS.map((option) => {
              const active = selected === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={cn(
                    "group relative rounded-[22px] border bg-card p-3 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "border-primary ring-1 ring-primary" : "border-border",
                  )}
                  onClick={() => choose(option.id)}
                >
                  {active ? (
                    <span className="absolute right-4 top-4 z-10 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3.5" aria-hidden />
                    </span>
                  ) : null}
                  <PresetMiniature preset={option.id} />
                  <div className="px-1 pb-1 pt-3">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <p className="font-semibold text-foreground">{option.label}</p>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{option.eyebrow}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{option.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">A pré-visualização é imediata. Só se torna permanente ao salvar.</p>
            <div className="flex items-center gap-3">
              {message ? <p role={message.startsWith("Não") ? "alert" : "status"} className="text-sm text-muted-foreground">{message}</p> : null}
              <Button
                type="button"
                isLoading={isPending}
                disabled={selected === savedPreset.current}
                onClick={() => {
                  setMessage(null);
                  startTransition(async () => {
                    const result = await updateAppearancePresetAction({ preset: selected });
                    if (result.error) {
                      setMessage(result.error);
                      return;
                    }
                    savedPreset.current = selected;
                    setMessage("Estilo visual salvo.");
                  });
                }}
              >
                Salvar estilo
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
