"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import {
  registerLogoAction,
  requestLogoPreviewUrlAction,
  requestLogoUploadUrlAction,
  setDefaultLogoAction,
  upsertDocumentBrandingAction,
} from "@/features/documents/branding-actions";
import type { DocumentBrandingRow, DocumentLogoRow } from "@/features/documents/branding-contracts";
import {
  applyVisualStyleToForm,
  brandingFormFromRow,
  brandingFormToRow,
  brandingFormToUpdateInput,
  brandingFormsEqual,
  restoreRecommendedVisual,
  type BrandingFormState,
  type BrandingIdentityFallback,
} from "@/features/documents/branding-form";
import { BrandingAdvancedSettings } from "@/features/documents/components/branding-advanced-settings";
import { BrandingLivePreview } from "@/features/documents/components/branding-live-preview";
import { BrandingLogoField } from "@/features/documents/components/branding-logo-field";
import { BrandingPalettePicker } from "@/features/documents/components/branding-palette-picker";
import { BrandingStylePicker } from "@/features/documents/components/branding-style-picker";
import { BrandingVisibleInfo } from "@/features/documents/components/branding-visible-info";
import { letterheadToProfile } from "@/features/documents/branding-presets";
import { profileLetterhead, resolveBranding } from "@/features/documents/branding-resolve";
import type { VisualProfile } from "@/features/documents/contracts";
import { cn } from "@/lib/utils/cn";

async function sha256HexOfBytes(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function PreviewPane({
  branding,
  logoUrl,
}: {
  branding: ReturnType<typeof resolveBranding>;
  logoUrl: string | null;
}) {
  return (
    <section className="rounded-[20px] border border-border bg-surface/70 p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-serif text-lg italic font-semibold text-foreground">Prévia</h3>
        <p className="text-xs text-muted-foreground">A4 · exemplo de documento</p>
      </div>
      <BrandingLivePreview branding={branding} logoUrl={logoUrl} />
    </section>
  );
}

export function BrandingSettingsPanel({
  branding,
  logos,
  fallback = {},
}: {
  branding: DocumentBrandingRow | null;
  logos: DocumentLogoRow[];
  fallback?: BrandingIdentityFallback;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<BrandingFormState>(() => brandingFormFromRow(branding));
  const [baseline, setBaseline] = useState<BrandingFormState>(() => brandingFormFromRow(branding));
  const [status, setStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customColorsOpen, setCustomColorsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [localLogoUrl, setLocalLogoUrl] = useState<string | null>(null);

  const dirty = !brandingFormsEqual(form, baseline);

  useEffect(() => {
    const next = brandingFormFromRow(branding);
    setForm(next);
    setBaseline(next);
    setStatus("idle");
  }, [branding]);

  useEffect(() => {
    if (dirty) setStatus("dirty");
  }, [dirty]);

  const defaultLogo = logos.find((logo) => logo.is_default) ?? logos[0];
  useEffect(() => {
    if (!defaultLogo || localLogoUrl) return;
    let cancelled = false;
    void requestLogoPreviewUrlAction(defaultLogo.id).then((result) => {
      if (!cancelled && result.url) setLogoUrl(result.url);
    });
    return () => {
      cancelled = true;
    };
  }, [defaultLogo, localLogoUrl]);

  const resolved = useMemo(() => {
    const letterheadCustom = form.letterheadPreset !== profileLetterhead(form.defaultVisualProfile);
    return resolveBranding(
      brandingFormToRow(form, branding?.organization_id),
      fallback,
      letterheadCustom ? undefined : form.defaultVisualProfile,
    );
  }, [form, fallback, branding?.organization_id]);

  const previewLogo = localLogoUrl ?? logoUrl;
  const displayedName =
    form.professionalName.trim() || fallback.professionalName?.trim() || "Profissional";
  const displayedCrp = form.crp.trim() || fallback.crp?.trim();
  const displayedClinic = form.clinicName.trim() || fallback.clinicName?.trim() || fallback.organizationName?.trim();
  const displayedTitle = form.professionalTitle.trim() || "Psicóloga";
  const displayedPhone = form.phone.trim() || form.professionalPhone.trim() || fallback.phone?.trim();
  const displayedEmail = form.email.trim() || form.professionalEmail.trim() || fallback.email?.trim();

  function patch(next: Partial<BrandingFormState>) {
    setForm((current) => ({ ...current, ...next }));
    setStatus("dirty");
  }

  function save() {
    setStatus("saving");
    startTransition(async () => {
      const result = await upsertDocumentBrandingAction(brandingFormToUpdateInput(form));
      if (result.error) {
        setStatus("error");
        return;
      }
      setBaseline(form);
      setStatus("saved");
      router.refresh();
    });
  }

  async function uploadLogo(
    file: File,
    variant: DocumentLogoRow["variant"] = "principal",
    makeDefault = logos.length === 0 || Boolean(logos.find((logo) => logo.is_default) && variant === "principal"),
  ) {
    const objectUrl = URL.createObjectURL(file);
    setLocalLogoUrl(objectUrl);
    const extension = file.name.split(".").pop()?.toLowerCase();
    const mime =
      file.type === "image/jpg"
        ? "image/jpeg"
        : file.type ||
          (extension === "svg"
            ? "image/svg+xml"
            : extension === "webp"
              ? "image/webp"
              : extension === "png"
                ? "image/png"
                : "image/jpeg");
    const prepared = await requestLogoUploadUrlAction({ filename: file.name, mimeType: mime });
    if (prepared.error || !prepared.path || !prepared.token) {
      setStatus("error");
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      setStatus("error");
      return;
    }
    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/upload/sign/document-branding/${prepared.path}?token=${prepared.token}`,
      {
        method: "PUT",
        headers: { "Content-Type": mime },
        body: file,
      },
    );
    if (!response.ok) {
      setStatus("error");
      return;
    }
    const result = await registerLogoAction({
      variant,
      label: file.name,
      storagePath: prepared.path,
      printStoragePath: mime === "image/png" || mime === "image/jpeg" ? prepared.path : null,
      mimeType: mime,
      byteSize: file.size,
      sha256: await sha256HexOfBytes(bytes),
      isDefault: makeDefault,
    });
    if (result.error) {
      setStatus("error");
      return;
    }
    router.refresh();
  }

  const statusMessage =
    status === "saving"
      ? "Salvando…"
      : status === "saved"
        ? "Identidade visual salva"
        : status === "error"
          ? "Não foi possível salvar a identidade visual."
          : dirty
            ? "Alterações não salvas"
            : null;

  const preview = <PreviewPane branding={resolved} logoUrl={previewLogo} />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-serif text-xl font-bold italic">Identidade visual dos documentos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha como seus documentos serão apresentados. Você pode visualizar o resultado antes de
          salvar.
        </p>
      </div>

      <button
        type="button"
        className="min-h-11 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground lg:hidden"
        onClick={() => setPreviewOpen(true)}
      >
        Ver prévia
      </button>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <BrandingStylePicker
            value={form.defaultVisualProfile}
            customized={form.letterheadPreset !== profileLetterhead(form.defaultVisualProfile)}
            onChange={(profile: VisualProfile) => {
              setForm((current) => applyVisualStyleToForm(current, profile));
              setStatus("dirty");
            }}
          />

          <BrandingLogoField
            logos={logos}
            previewUrl={previewLogo}
            onPickFile={(file) => void uploadLogo(file)}
            onPreview={(id) =>
              void requestLogoPreviewUrlAction(id).then((result) => {
                if (result.url) {
                  window.open(result.url, "_blank", "noopener,noreferrer");
                }
              })
            }
          />

          <BrandingPalettePicker
            colors={{
              primary: form.colorPrimary,
              secondary: form.colorSecondary,
              headings: form.colorHeadings,
              dividers: form.colorDividers,
            }}
            customOpen={customColorsOpen}
            onSelect={(colors) =>
              patch({
                colorPrimary: colors.primary,
                colorSecondary: colors.secondary,
                colorHeadings: colors.headings,
                colorDividers: colors.dividers,
              })
            }
            onToggleCustom={() => setCustomColorsOpen((current) => !current)}
            onCustomChange={(key, value) => {
              const map = {
                primary: "colorPrimary",
                secondary: "colorSecondary",
                headings: "colorHeadings",
                dividers: "colorDividers",
              } as const;
              patch({ [map[key]]: value });
            }}
          />

          <div>
            <h3 className="text-sm font-semibold text-foreground">Dados utilizados</h3>
            <p className="mt-1 text-sm text-foreground">
              {displayedName}
              <span className="text-muted-foreground">
                {" "}
                · {displayedTitle}
                {displayedCrp ? ` · CRP ${displayedCrp}` : ""}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              {[displayedClinic, displayedPhone, displayedEmail].filter(Boolean).join(" · ") ||
                "Usamos os dados do consultório quando a identidade ainda não tem overrides."}
            </p>
            <Button type="button" variant="ghost" className="mt-1 px-2" onClick={() => setDataOpen(true)}>
              Alterar dados exibidos
            </Button>
          </div>

          <BrandingVisibleInfo form={form} fallback={fallback} onChange={patch} />

          <BrandingAdvancedSettings
            form={form}
            logos={logos}
            open={advancedOpen}
            onOpenChange={setAdvancedOpen}
            onChange={(next) => {
              setForm((current) => {
                if (next.letterheadPreset) {
                  const mapped = letterheadToProfile(next.letterheadPreset);
                  return {
                    ...current,
                    ...next,
                    defaultVisualProfile: mapped ?? current.defaultVisualProfile,
                  };
                }
                return { ...current, ...next };
              });
              setStatus("dirty");
            }}
            onUploadVariant={(file, variant) => void uploadLogo(file, variant, false)}
            onPreviewLogo={(id) =>
              void requestLogoPreviewUrlAction(id).then((result) => {
                if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
              })
            }
            onSetDefaultLogo={(id) => void setDefaultLogoAction(id).then(() => router.refresh())}
          />

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => setRestoreOpen(true)}>
                Restaurar padrão recomendado
              </Button>
              <Button type="button" onClick={save} isLoading={isPending || status === "saving"}>
                {status === "saving" ? "Salvando…" : "Salvar identidade visual"}
              </Button>
            </div>
            {statusMessage ? (
              <p
                role={status === "error" ? "alert" : "status"}
                className={cn(
                  "text-sm",
                  status === "error" ? "text-failed" : "text-muted-foreground",
                )}
              >
                {status === "saved" ? "✓ " : null}
                {statusMessage}
                {status === "error" ? (
                  <button
                    type="button"
                    className="ml-2 font-semibold underline"
                    onClick={save}
                  >
                    Tentar novamente
                  </button>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>

        <div className="hidden min-w-0 lg:block">
          <div className="lg:sticky lg:top-6">{preview}</div>
        </div>
      </div>

      <section className="rounded-[20px] border border-border bg-card p-5 shadow-card">
        <h3 className="font-serif text-lg italic font-semibold">Configurações dos documentos</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Regras de conteúdo que não alteram a aparência do papel.
        </p>
        <label className="mt-4 flex flex-col gap-1 text-xs text-muted-foreground">
          Antecedência de cancelamento (horas)
          <Input
            type="number"
            min={1}
            max={168}
            className="w-32"
            value={form.cancellationNoticeHours}
            onChange={(event) => patch({ cancellationNoticeHours: Number(event.target.value) })}
          />
        </label>
        <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-sage-700"
            checked={form.includeAiInformativeClause}
            onChange={(event) => patch({ includeAiInformativeClause: event.target.checked })}
          />
          Incluir cláusula informativa de IA nos contratos (consentimento específico continua separado)
        </label>
      </section>

      <Drawer open={previewOpen} onOpenChange={setPreviewOpen}>
        <DrawerContent
          title="Prévia"
          description="A4 · exemplo de documento"
          className="inset-x-0 bottom-0 top-auto h-[min(94vh,920px)] w-full max-w-none rounded-t-3xl border-l-0 border-t sm:max-w-none"
        >
          {preview}
        </DrawerContent>
      </Drawer>

      <Drawer open={dataOpen} onOpenChange={setDataOpen}>
        <DrawerContent
          title="Alterar dados exibidos"
          description="Overrides apenas para os documentos. O cadastro do consultório permanece como está."
          footer={
            <Button type="button" onClick={() => setDataOpen(false)}>
              Concluído
            </Button>
          }
        >
          <div className="grid gap-3">
            {(
              [
                ["professionalName", "Nome profissional"],
                ["professionalTitle", "Título profissional"],
                ["crp", "CRP"],
                ["crpState", "UF do CRP"],
                ["clinicName", "Nome da clínica"],
                ["phone", "Telefone"],
                ["email", "E-mail"],
                ["city", "Cidade"],
                ["state", "UF"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1 text-xs text-muted-foreground">
                {label}
                <Input
                  value={form[key]}
                  onChange={(event) => patch({ [key]: event.target.value })}
                />
              </label>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title="Restaurar padrão recomendado?"
        description="Aplica o estilo Clínico e os padrões visuais recomendados. Logos e dados cadastrais são mantidos."
        confirmLabel="Restaurar"
        cancelLabel="Cancelar"
        destructive={false}
        onConfirm={() => {
          setForm((current) => restoreRecommendedVisual(current));
          setStatus("dirty");
          setRestoreOpen(false);
        }}
      />
    </div>
  );
}
