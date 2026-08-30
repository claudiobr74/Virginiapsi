"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  LETTERHEAD_PRESET_VALUES,
  LOGO_VARIANT_VALUES,
  TYPOGRAPHY_PRESET_VALUES,
  type DocumentBrandingRow,
  type DocumentLogoRow,
} from "@/features/documents/branding-contracts";
import {
  registerLogoAction,
  requestLogoPreviewUrlAction,
  requestLogoUploadUrlAction,
  setDefaultLogoAction,
  upsertDocumentBrandingAction,
} from "@/features/documents/branding-actions";

async function sha256HexOfBytes(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function BrandingSettingsPanel({
  branding,
  logos,
}: {
  branding: DocumentBrandingRow | null;
  logos: DocumentLogoRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    clinicName: branding?.clinic_name ?? "",
    tradeName: branding?.trade_name ?? "",
    legalName: branding?.legal_name ?? "",
    addressLine: branding?.address_line ?? "",
    city: branding?.city ?? "",
    state: branding?.state ?? "",
    postalCode: branding?.postal_code ?? "",
    phone: branding?.phone ?? "",
    email: branding?.email ?? "",
    website: branding?.website ?? "",
    taxId: branding?.tax_id ?? "",
    professionalName: branding?.professional_name ?? "",
    crp: branding?.crp ?? "",
    crpState: branding?.crp_state ?? "",
    professionalTitle: branding?.professional_title ?? "",
    qualifications: branding?.qualifications ?? "",
    professionalPhone: branding?.professional_phone ?? "",
    professionalEmail: branding?.professional_email ?? "",
    colorPrimary: branding?.color_primary ?? "#3a4f43",
    colorSecondary: branding?.color_secondary ?? "#8a8f8a",
    colorHeadings: branding?.color_headings ?? "#171816",
    colorDividers: branding?.color_dividers ?? "#c5d0c6",
    typographyPreset: branding?.typography_preset ?? "classica",
    letterheadPreset: branding?.letterhead_preset ?? "clinico",
    cancellationNoticeHours: branding?.cancellation_notice_hours ?? 24,
    includeAiInformativeClause: branding?.include_ai_informative_clause ?? false,
    headerLogo: branding?.header_logo ?? true,
    headerClinic: branding?.header_clinic ?? true,
    headerProfessional: branding?.header_professional ?? true,
    headerCrp: branding?.header_crp ?? true,
    headerPhone: branding?.header_phone ?? false,
    headerEmail: branding?.header_email ?? false,
    headerAddress: branding?.header_address ?? false,
    headerWebsite: branding?.header_website ?? false,
    footerClinic: branding?.footer_clinic ?? true,
    footerProfessional: branding?.footer_professional ?? true,
    footerCrp: branding?.footer_crp ?? true,
    footerPhone: branding?.footer_phone ?? false,
    footerEmail: branding?.footer_email ?? false,
    footerAddress: branding?.footer_address ?? false,
    footerWebsite: branding?.footer_website ?? false,
    footerPageNumbers: branding?.footer_page_numbers ?? true,
    footerDocumentId: branding?.footer_document_id ?? true,
    footerVersion: branding?.footer_version ?? true,
    footerHash: branding?.footer_hash ?? false,
    showClinicName: branding?.show_clinic_name ?? true,
    showAddress: branding?.show_address ?? true,
    showCity: branding?.show_city ?? true,
    showPhone: branding?.show_phone ?? true,
    showEmail: branding?.show_email ?? true,
    showWebsite: branding?.show_website ?? false,
    showTaxId: branding?.show_tax_id ?? false,
  });

  function save() {
    startTransition(async () => {
      const result = await upsertDocumentBrandingAction(form);
      setMessage(result.error ?? "Identidade visual salva.");
      if (!result.error) router.refresh();
    });
  }

  async function uploadLogo(file: File, variant: (typeof LOGO_VARIANT_VALUES)[number], makeDefault: boolean) {
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
      setMessage(prepared.error ?? "Falha no upload.");
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      setMessage("Ambiente de storage indisponível.");
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
      setMessage("Não foi possível enviar o arquivo.");
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
    setMessage(result.error ?? "Logo enviada. SVG/WEBP aparecem na tela; o PDF usa PNG/JPEG.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-serif text-xl font-bold italic">Identidade visual dos documentos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Logos, cores, tipografia, papel timbrado e dados que aparecem em cabeçalho e rodapé. Nada aqui
          é nome de clínica fixo no código.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["clinicName", "Nome da clínica"],
            ["tradeName", "Nome fantasia"],
            ["legalName", "Razão social"],
            ["addressLine", "Endereço"],
            ["city", "Cidade"],
            ["state", "UF"],
            ["postalCode", "CEP"],
            ["phone", "Telefone"],
            ["email", "E-mail"],
            ["website", "Site"],
            ["taxId", "CNPJ"],
            ["professionalName", "Nome profissional"],
            ["crp", "CRP"],
            ["crpState", "UF do CRP"],
            ["professionalTitle", "Título / especialidade"],
            ["professionalPhone", "Telefone profissional"],
            ["professionalEmail", "E-mail profissional"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1 text-xs">
            {label}
            <input
              className="rounded-xl border border-border bg-input px-3 py-2 text-sm"
              value={form[key]}
              onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
            />
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-xs">
        Qualificações
        <textarea
          rows={2}
          className="rounded-xl border border-border bg-input px-3 py-2 text-sm"
          value={form.qualifications}
          onChange={(event) => setForm((current) => ({ ...current, qualifications: event.target.value }))}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          Tipografia
          <select
            className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2"
            value={form.typographyPreset}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                typographyPreset: event.target.value as typeof current.typographyPreset,
              }))
            }
          >
            {TYPOGRAPHY_PRESET_VALUES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Papel timbrado
          <select
            className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2"
            value={form.letterheadPreset}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                letterheadPreset: event.target.value as typeof current.letterheadPreset,
              }))
            }
          >
            {LETTERHEAD_PRESET_VALUES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["colorPrimary", "Cor principal"],
            ["colorSecondary", "Secundária"],
            ["colorHeadings", "Títulos"],
            ["colorDividers", "Divisores"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="text-xs">
            {label}
            <input
              type="color"
              className="mt-1 h-10 w-full"
              value={form[key]}
              onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
            />
          </label>
        ))}
      </div>

      <label className="text-xs">
        Antecedência de cancelamento (horas)
        <input
          type="number"
          min={1}
          max={168}
          className="mt-1 w-32 rounded-xl border border-border bg-input px-3 py-2"
          value={form.cancellationNoticeHours}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              cancellationNoticeHours: Number(event.target.value),
            }))
          }
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.includeAiInformativeClause}
          onChange={(event) =>
            setForm((current) => ({ ...current, includeAiInformativeClause: event.target.checked }))
          }
        />
        Incluir cláusula informativa de IA nos contratos (consentimento específico continua separado)
      </label>

      <div className="flex flex-wrap gap-3 text-xs">
        {(
          [
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
            ["footerAddress", "Rodapé: endereço"],
            ["footerWebsite", "Rodapé: site"],
            ["footerPageNumbers", "Rodapé: página X de Y"],
            ["footerDocumentId", "Rodapé: document ID"],
            ["footerVersion", "Rodapé: versão"],
            ["footerHash", "Rodapé: hash"],
            ["showClinicName", "Exibir nome da clínica"],
            ["showAddress", "Exibir endereço"],
            ["showCity", "Exibir cidade"],
            ["showPhone", "Exibir telefone"],
            ["showEmail", "Exibir e-mail"],
            ["showWebsite", "Exibir site"],
            ["showTaxId", "Exibir CNPJ"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={Boolean(form[key])}
              onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.checked }))}
            />
            {label}
          </label>
        ))}
      </div>

      <Button type="button" onClick={save} isLoading={isPending}>
        Salvar identidade
      </Button>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <section className="rounded-3xl border border-border p-4">
        <h3 className="font-semibold">Logos</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          PNG e JPG entram no PDF. SVG e WEBP são armazenados para a tela; envie também um PNG de impressão
          se quiser a marca no PDF. A proporção é preservada — a imagem nunca é esticada.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {logos.map((logo) => (
            <div key={logo.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
              <span>
                {logo.variant} {logo.label ? `· ${logo.label}` : ""} {logo.is_default ? "· padrão" : ""}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    startTransition(async () => {
                      const result = await requestLogoPreviewUrlAction(logo.id);
                      if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
                    })
                  }
                >
                  Ver
                </Button>
                {logo.is_default ? null : (
                  <Button type="button" size="sm" variant="secondary" onClick={() => void setDefaultLogoAction(logo.id)}>
                    Tornar padrão
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <label className="mt-3 flex flex-col gap-1 text-xs">
          Enviar logo (PNG, JPG, JPEG, WEBP, SVG)
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadLogo(file, "principal", logos.length === 0);
            }}
          />
        </label>
      </section>
    </div>
  );
}
