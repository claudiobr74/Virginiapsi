"use client";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import {
  DOCUMENT_TONE_VALUES,
  LENGTH_PRESET_VALUES,
  LOGO_ALIGN_VALUES,
  LOGO_MODE_VALUES,
  LOGO_SIZE_VALUES,
  VISUAL_PROFILE_LABELS,
  VISUAL_PROFILE_VALUES,
  type DocumentRow,
} from "@/features/documents/contracts";
import type { SystemTemplateDefinition } from "@/features/documents/system-templates";

export function DocumentSettingsDrawer({
  open,
  onOpenChange,
  document,
  template,
  isEditable,
  recipientName,
  purpose,
  visualProfile,
  logoMode,
  logoAlign,
  logoSize,
  coverEnabled,
  layoutFormat,
  tone,
  lengthPreset,
  onRecipientName,
  onPurpose,
  onVisualProfile,
  onLogoMode,
  onLogoAlign,
  onLogoSize,
  onCoverEnabled,
  onLayoutFormat,
  onTone,
  onLengthPreset,
  onImportSchedule,
  importingSchedule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: DocumentRow;
  template: SystemTemplateDefinition | null;
  isEditable: boolean;
  recipientName: string;
  purpose: string;
  visualProfile: DocumentRow["visual_profile"];
  logoMode: DocumentRow["logo_mode"];
  logoAlign: DocumentRow["logo_align"];
  logoSize: DocumentRow["logo_size"];
  coverEnabled: boolean;
  layoutFormat: DocumentRow["layout_format"];
  tone: DocumentRow["tone"];
  lengthPreset: DocumentRow["length_preset"];
  onRecipientName: (value: string) => void;
  onPurpose: (value: string) => void;
  onVisualProfile: (value: DocumentRow["visual_profile"]) => void;
  onLogoMode: (value: DocumentRow["logo_mode"]) => void;
  onLogoAlign: (value: DocumentRow["logo_align"]) => void;
  onLogoSize: (value: DocumentRow["logo_size"]) => void;
  onCoverEnabled: (value: boolean) => void;
  onLayoutFormat: (value: DocumentRow["layout_format"]) => void;
  onTone: (value: DocumentRow["tone"]) => void;
  onLengthPreset: (value: DocumentRow["length_preset"]) => void;
  onImportSchedule?: () => void;
  importingSchedule?: boolean;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        title="Ajustes do documento"
        description="Dados, aparência e texto. O conteúdo permanece no editor."
        tone="documents"
        className="sm:max-w-md"
      >
        <div className="flex flex-col gap-6">
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Dados</h3>
            <label className="mt-3 flex flex-col gap-1 text-xs">
              Destinatário
              <input
                disabled={!isEditable}
                className="rounded-lg border border-border bg-input px-2 py-1.5"
                value={recipientName}
                onChange={(event) => onRecipientName(event.target.value)}
              />
            </label>
            <label className="mt-2 flex flex-col gap-1 text-xs">
              Finalidade
              <textarea
                disabled={!isEditable}
                rows={3}
                className="rounded-lg border border-border bg-input px-2 py-1.5"
                value={purpose}
                onChange={(event) => onPurpose(event.target.value)}
              />
            </label>
            {document.document_kind === "contrato" && isEditable && onImportSchedule ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-3"
                isLoading={importingSchedule}
                onClick={onImportSchedule}
              >
                Importar encontros da agenda
              </Button>
            ) : null}
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Aparência</h3>
            <label className="mt-3 flex flex-col gap-1 text-xs" htmlFor="document-visual-profile">
              Perfil visual
              <select
                id="document-visual-profile"
                disabled={!isEditable}
                className="rounded-lg border border-border bg-input px-2 py-1.5"
                value={visualProfile}
                onChange={(event) => onVisualProfile(event.target.value as DocumentRow["visual_profile"])}
              >
                {VISUAL_PROFILE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {VISUAL_PROFILE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-2 flex flex-col gap-1 text-xs" htmlFor="document-logo-mode">
              Logo
              <select
                id="document-logo-mode"
                disabled={!isEditable}
                className="rounded-lg border border-border bg-input px-2 py-1.5"
                value={logoMode}
                onChange={(event) => onLogoMode(event.target.value as DocumentRow["logo_mode"])}
              >
                {LOGO_MODE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {value === "clinic_default" ? "Padrão da clínica" : value === "none" ? "Sem logo" : value}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <select
                disabled={!isEditable}
                aria-label="Alinhamento da logo"
                className="rounded-lg border border-border bg-input px-2 py-1.5 text-xs"
                value={logoAlign}
                onChange={(event) => onLogoAlign(event.target.value as DocumentRow["logo_align"])}
              >
                {LOGO_ALIGN_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <select
                disabled={!isEditable}
                aria-label="Tamanho da logo"
                className="rounded-lg border border-border bg-input px-2 py-1.5 text-xs"
                value={logoSize}
                onChange={(event) => onLogoSize(event.target.value as DocumentRow["logo_size"])}
              >
                {LOGO_SIZE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            {template?.supportsCover ? (
              <label className="mt-2 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={coverEnabled}
                  disabled={!isEditable}
                  onChange={(event) => onCoverEnabled(event.target.checked)}
                />
                Capa
              </label>
            ) : null}
            {template?.supportsBooklet ? (
              <label className="mt-2 flex flex-col gap-1 text-xs">
                Formato
                <select
                  aria-label="Formato"
                  disabled={!isEditable}
                  className="rounded-lg border border-border bg-input px-2 py-1.5"
                  value={layoutFormat}
                  onChange={(event) => onLayoutFormat(event.target.value as DocumentRow["layout_format"])}
                >
                  <option value="tradicional">Tradicional</option>
                  <option value="livreto">Livreto</option>
                </select>
              </label>
            ) : null}
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Texto</h3>
            <label className="mt-3 flex flex-col gap-1 text-xs" htmlFor="document-tone">
              Tom
              <select
                id="document-tone"
                disabled={!isEditable}
                className="rounded-lg border border-border bg-input px-2 py-1.5"
                value={tone}
                onChange={(event) => onTone(event.target.value as DocumentRow["tone"])}
              >
                {DOCUMENT_TONE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-2 flex flex-col gap-1 text-xs" htmlFor="document-length">
              Extensão
              <select
                id="document-length"
                disabled={!isEditable}
                className="rounded-lg border border-border bg-input px-2 py-1.5"
                value={lengthPreset}
                onChange={(event) => onLengthPreset(event.target.value as DocumentRow["length_preset"])}
              >
                {LENGTH_PRESET_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </section>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
