"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LETTERHEAD_PRESET_VALUES,
  LOGO_VARIANT_VALUES,
  TYPOGRAPHY_PRESET_VALUES,
  type DocumentLogoRow,
} from "@/features/documents/branding-contracts";
import type { BrandingFormState } from "@/features/documents/branding-form";
import {
  LETTERHEAD_PRESET_LABELS,
  LOGO_VARIANT_LABELS,
  TYPOGRAPHY_PRESET_LABELS,
} from "@/features/documents/branding-presets";
import { profileLetterhead } from "@/features/documents/branding-resolve";
import { cn } from "@/lib/utils/cn";

const ADVANCED_FLAGS: Array<[keyof BrandingFormState, string]> = [
  ["headerLogo", "Cabeçalho: logo"],
  ["headerClinic", "Cabeçalho: clínica"],
  ["headerProfessional", "Cabeçalho: profissional"],
  ["headerCrp", "Cabeçalho: CRP"],
  ["headerPhone", "Cabeçalho: telefone"],
  ["headerEmail", "Cabeçalho: e-mail"],
  ["headerAddress", "Cabeçalho: endereço"],
  ["headerWebsite", "Cabeçalho: site"],
  ["footerClinic", "Rodapé: clínica"],
  ["footerProfessional", "Rodapé: profissional"],
  ["footerCrp", "Rodapé: CRP"],
  ["footerPhone", "Rodapé: telefone"],
  ["footerEmail", "Rodapé: e-mail"],
  ["footerAddress", "Rodapé: cidade/UF"],
  ["footerWebsite", "Rodapé: site"],
  ["footerPageNumbers", "Rodapé: paginação"],
  ["footerDocumentId", "Rodapé: identificador do documento"],
  ["footerVersion", "Rodapé: versão"],
  ["footerHash", "Rodapé: verificação"],
  ["showClinicName", "Exibir nome da clínica"],
  ["showTradeName", "Exibir nome fantasia"],
  ["showLegalName", "Exibir razão social"],
  ["showAddress", "Exibir endereço completo"],
  ["showCity", "Exibir cidade"],
  ["showPhone", "Exibir telefone"],
  ["showEmail", "Exibir e-mail"],
  ["showWebsite", "Exibir site"],
  ["showTaxId", "Exibir CNPJ"],
];

const COMMERCIAL_FIELDS: Array<[keyof BrandingFormState, string]> = [
  ["tradeName", "Nome fantasia"],
  ["legalName", "Razão social"],
  ["addressLine", "Endereço"],
  ["postalCode", "CEP"],
  ["website", "Site"],
  ["taxId", "CNPJ"],
  ["qualifications", "Qualificações"],
  ["professionalPhone", "Telefone profissional"],
  ["professionalEmail", "E-mail profissional"],
];

export function BrandingAdvancedSettings({
  form,
  logos,
  open,
  onOpenChange,
  onChange,
  onUploadVariant,
  onPreviewLogo,
  onSetDefaultLogo,
}: {
  form: BrandingFormState;
  logos: DocumentLogoRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (patch: Partial<BrandingFormState>) => void;
  onUploadVariant: (file: File, variant: (typeof LOGO_VARIANT_VALUES)[number]) => void;
  onPreviewLogo: (logoId: string) => void;
  onSetDefaultLogo: (logoId: string) => void;
}) {
  const letterheadCustom = form.letterheadPreset !== profileLetterhead(form.defaultVisualProfile);
  const [logoVariant, setLogoVariant] = useState<(typeof LOGO_VARIANT_VALUES)[number]>("horizontal");

  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={open}
        aria-controls="branding-advanced-panel"
        aria-label="Opções avançadas"
        onClick={() => onOpenChange(!open)}
      >
        <span>
          <span className="block text-sm font-semibold text-foreground">Opções avançadas</span>
          <span className="text-xs text-muted-foreground">
            Cabeçalho, rodapé, tipografia e informações adicionais.
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div id="branding-advanced-panel" className="flex flex-col gap-5 border-t border-border px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Tipografia
              <select
                aria-label="Tipografia"
                className="h-11 rounded-xl border border-border bg-input px-3 text-sm text-foreground"
                value={form.typographyPreset}
                onChange={(event) =>
                  onChange({ typographyPreset: event.target.value as BrandingFormState["typographyPreset"] })
                }
              >
                {TYPOGRAPHY_PRESET_VALUES.map((value) => (
                  <option key={value} value={value} style={{ fontFamily: value === "moderna" ? "sans-serif" : "serif" }}>
                    {TYPOGRAPHY_PRESET_LABELS[value]}
                  </option>
                ))}
              </select>
              <span
                className="text-[13px] text-foreground"
                style={{
                  fontFamily:
                    form.typographyPreset === "moderna"
                      ? "system-ui, sans-serif"
                      : 'Georgia, "Times New Roman", serif',
                }}
              >
                Psicologia com presença
              </span>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Papel timbrado
              {letterheadCustom ? (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-sage-700">Personalizado</span>
              ) : null}
              <select
                aria-label="Papel timbrado"
                className="h-11 rounded-xl border border-border bg-input px-3 text-sm text-foreground"
                value={form.letterheadPreset}
                onChange={(event) =>
                  onChange({ letterheadPreset: event.target.value as BrandingFormState["letterheadPreset"] })
                }
              >
                {LETTERHEAD_PRESET_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {LETTERHEAD_PRESET_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-deep-neutral">Cabeçalho e rodapé</p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {ADVANCED_FLAGS.map(([key, label]) => (
                <label key={key} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-sage-700"
                    checked={Boolean(form[key])}
                    onChange={(event) => onChange({ [key]: event.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-deep-neutral">Dados comerciais</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {COMMERCIAL_FIELDS.map(([key, label]) =>
                key === "qualifications" ? (
                  <label key={key} className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                    {label}
                    <textarea
                      rows={2}
                      className="rounded-xl border border-border bg-input px-3 py-2 text-sm text-foreground"
                      value={form.qualifications}
                      onChange={(event) => onChange({ qualifications: event.target.value })}
                    />
                  </label>
                ) : (
                  <label key={key} className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {label}
                    <Input
                      value={String(form[key])}
                      onChange={(event) => onChange({ [key]: event.target.value })}
                    />
                  </label>
                ),
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-deep-neutral">Gerenciar logos</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Variantes (horizontal, compacta, monocromática) ficam aqui. A marca principal aparece na prévia.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {logos.map((logo) => (
                <div
                  key={logo.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm"
                >
                  <span>
                    {LOGO_VARIANT_LABELS[logo.variant] ?? logo.variant}
                    {logo.label ? ` · ${logo.label}` : ""}
                    {logo.is_default ? " · padrão" : ""}
                  </span>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => onPreviewLogo(logo.id)}>
                      Ver
                    </Button>
                    {logo.is_default ? null : (
                      <Button type="button" size="sm" variant="secondary" onClick={() => onSetDefaultLogo(logo.id)}>
                        Tornar padrão
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <label className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
              Variante
              <select
                aria-label="Variante da logo"
                className="h-11 rounded-xl border border-border bg-input px-3 text-sm text-foreground"
                value={logoVariant}
                onChange={(event) =>
                  setLogoVariant(event.target.value as (typeof LOGO_VARIANT_VALUES)[number])
                }
              >
                {LOGO_VARIANT_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {LOGO_VARIANT_LABELS[value] ?? value}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
              Enviar variante
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onUploadVariant(file, logoVariant);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
