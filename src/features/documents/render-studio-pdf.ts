import "server-only";

import type { DocumentRow, DocumentSection, DocumentVersionRow } from "@/features/documents/contracts";
import { getDocumentBranding, getDocumentLogo, listDocumentLogos } from "@/features/documents/branding-queries";
import { getVisualProfileLayout } from "@/features/documents/branding-layout";
import { resolveBranding, recommendedProfileForKind } from "@/features/documents/branding-resolve";
import { getPracticeSettings } from "@/features/settings/queries";
import { getShellSettings, listAssignablePsychologists } from "@/features/organizations/queries";
import { getPatient } from "@/features/patients/queries";
import { DOCUMENT_KIND_LABELS } from "@/features/documents/contracts";
import { generateStudioPdf, type StudioCoverSpec } from "@/lib/documents/studio-pdf";
import { DOCUMENT_BUCKETS, downloadFile } from "@/lib/documents/storage";
import { getSystemTemplate } from "@/features/documents/system-templates";

export async function renderDocumentStudioPdf(input: {
  organizationId: string;
  document: DocumentRow;
  version: DocumentVersionRow;
  sections: DocumentSection[];
  signatureLines?: string[];
  includeManualSignature?: boolean;
}): Promise<Uint8Array> {
  const [brandingRow, logos, practice, shell, psychologists] = await Promise.all([
    getDocumentBranding(input.organizationId),
    listDocumentLogos(input.organizationId),
    getPracticeSettings(input.organizationId),
    getShellSettings(input.organizationId),
    listAssignablePsychologists(input.organizationId),
  ]);

  const profile = input.document.visual_profile ?? recommendedProfileForKind(input.document.document_kind);
  const profileLayout = getVisualProfileLayout(profile);
  const professionalEmail =
    psychologists.find((person) => person.role === "psychologist_admin")?.email ??
    psychologists[0]?.email ??
    null;
  const branding = resolveBranding(
    brandingRow,
    {
      organizationName: shell?.organization_name,
      professionalName: practice?.professional_name,
      professionalTitle: practice?.subtitle,
      crp: practice?.crp,
      clinicName: practice?.clinic_name,
      email: professionalEmail,
      legalName: practice?.company_name,
      taxId: practice?.company_cnpj,
    },
    profile,
  );

  let logoBytes: Uint8Array | null = null;
  let logoMime: string | null = null;
  if (input.document.logo_mode !== "none") {
    const variantMap: Record<string, string> = {
      clinic_default: "default",
      principal: "principal",
      horizontal: "horizontal",
      profissional: "profissional",
    };
    const wanted = variantMap[input.document.logo_mode] ?? "default";
    const chosen =
      wanted === "default"
        ? logos.find((logo) => logo.is_default) ?? logos[0]
        : logos.find((logo) => logo.variant === wanted) ?? logos.find((logo) => logo.is_default);
    const logoId = wanted === "default" ? brandingRow?.default_logo_id : chosen?.id;
    const logo = logoId ? await getDocumentLogo(input.organizationId, logoId) : chosen;
    const path = logo?.print_storage_path || logo?.storage_path;
    if (logo && path && (logo.mime_type === "image/png" || logo.mime_type === "image/jpeg")) {
      try {
        logoBytes = await downloadFile(DOCUMENT_BUCKETS.documentBranding, path);
        logoMime = logo.mime_type;
      } catch {
        logoBytes = null;
      }
    }
  }

  const template = input.document.system_template_key
    ? getSystemTemplate(input.document.system_template_key)
    : null;
  const bookletLayout = input.document.layout_format === "livreto";
  let subjectName: string | undefined;
  if (input.document.patient_id) {
    const patient = await getPatient(input.organizationId, input.document.patient_id);
    subjectName = patient?.full_name ?? patient?.preferred_name ?? undefined;
  }
  const cover: StudioCoverSpec | null =
    input.document.cover_enabled && template?.supportsCover && !bookletLayout
      ? {
          documentType: DOCUMENT_KIND_LABELS[input.document.document_kind],
          subjectName: subjectName ?? null,
          requester: input.document.recipient_name,
          purpose: input.document.purpose,
          city: branding.cityState,
          dateLabel: new Date().toLocaleDateString("pt-BR"),
        }
      : null;

  const professionalLines = [
    branding.professionalName || "Profissional",
    branding.professionalTitle,
    branding.crpLabel,
  ].filter(Boolean);
  const clientLines = ["Pessoa atendida / responsável"];
  const effectiveLogoAlign =
    profile === "premium" && input.document.logo_align === "left"
      ? profileLayout.logoAlignment
      : input.document.logo_align;

  return generateStudioPdf({
    title: input.document.title,
    documentKindLabel: DOCUMENT_KIND_LABELS[input.document.document_kind],
    sections: input.sections,
    branding,
    logoBytes,
    logoMime,
    logoAlign: effectiveLogoAlign,
    logoSize: input.document.logo_size,
    logoCustomMaxPt: input.document.logo_custom_max_pt,
    documentId: input.document.id,
    version: input.version.version,
    contentSha256: input.version.content_sha256,
    cover,
    layout: input.document.layout_format,
    signatureLines: input.signatureLines,
    manualSignatureBlock: input.includeManualSignature !== false
      ? { professionalLines, clientLines }
      : undefined,
    classicMode: !input.document.system_template_key,
  });
}
