"use client";

import { Button } from "@/components/ui/button";
import type { DocumentLogoRow } from "@/features/documents/branding-contracts";
import { cn } from "@/lib/utils/cn";

export function BrandingLogoField({
  logos,
  previewUrl,
  onPickFile,
  onPreview,
}: {
  logos: DocumentLogoRow[];
  previewUrl: string | null;
  onPickFile: (file: File) => void;
  onPreview: (logoId: string) => void;
}) {
  const defaultLogo = logos.find((logo) => logo.is_default) ?? logos[0] ?? null;
  const inputId = "branding-logo-file";

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">Sua marca</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        A logo será usada no cabeçalho dos documentos.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <div
          className={cn(
            "flex size-[72px] items-center justify-center overflow-hidden rounded-2xl border border-border bg-white",
          )}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Logo atual" className="max-h-16 max-w-16 object-contain" />
          ) : (
            <span className="px-2 text-center text-[10px] text-muted-foreground">Sem logo</span>
          )}
        </div>
        <div className="flex min-h-11 flex-col justify-center gap-1">
          <label htmlFor={inputId}>
            <span className="sr-only">{defaultLogo ? "Alterar logo" : "Adicionar logo"}</span>
            <input
              id={inputId}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onPickFile(file);
                event.target.value = "";
              }}
            />
            <span className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-deep-neutral hover:bg-sage-light/30">
              {defaultLogo ? "Alterar logo" : "Adicionar logo"}
            </span>
          </label>
        </div>
      </div>
      {logos.length > 1 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {logos.length} logos cadastradas. Variantes ficam em opções avançadas.
        </p>
      ) : null}
      {defaultLogo && !previewUrl ? (
        <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={() => onPreview(defaultLogo.id)}>
          Carregar prévia da logo
        </Button>
      ) : null}
    </div>
  );
}
