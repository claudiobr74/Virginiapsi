"use server";

import { revalidatePath } from "next/cache";
import {
  registerLogoSchema,
  updateBrandingSchema,
} from "@/features/documents/branding-contracts";
import { getDocumentBranding, getDocumentLogo } from "@/features/documents/branding-queries";
import { defaultBranding } from "@/features/documents/branding-resolve";
import {
  DOCUMENT_BUCKETS,
  buildStoragePath,
  createSignedDownloadUrl,
  createSignedUploadUrl,
} from "@/lib/documents/storage";
import { isOrgScopedStoragePath } from "@/lib/documents/storage-meta";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface BrandingActionResult {
  error?: string;
  id?: string;
  url?: string;
  path?: string;
  token?: string;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export async function upsertDocumentBrandingAction(input: unknown): Promise<BrandingActionResult> {
  const { organizationId, role } = await requireOrgContext();
  if (role !== "psychologist_admin") {
    return { error: "Somente a psicóloga administradora configura a identidade visual." };
  }
  const parsed = updateBrandingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;
  const existing = await getDocumentBranding(organizationId);
  const fallback = existing ?? defaultBranding();
  const row = {
    organization_id: organizationId,
    clinic_name: v.clinicName !== undefined ? emptyToNull(v.clinicName) : fallback.clinic_name,
    trade_name: v.tradeName !== undefined ? emptyToNull(v.tradeName) : fallback.trade_name,
    legal_name: v.legalName !== undefined ? emptyToNull(v.legalName) : fallback.legal_name,
    address_line: v.addressLine !== undefined ? emptyToNull(v.addressLine) : fallback.address_line,
    city: v.city !== undefined ? emptyToNull(v.city) : fallback.city,
    state: v.state !== undefined ? emptyToNull(v.state) : fallback.state,
    postal_code: v.postalCode !== undefined ? emptyToNull(v.postalCode) : fallback.postal_code,
    phone: v.phone !== undefined ? emptyToNull(v.phone) : fallback.phone,
    email: v.email !== undefined ? emptyToNull(v.email) : fallback.email,
    website: v.website !== undefined ? emptyToNull(v.website) : fallback.website,
    tax_id: v.taxId !== undefined ? emptyToNull(v.taxId) : fallback.tax_id,
    professional_name:
      v.professionalName !== undefined ? emptyToNull(v.professionalName) : fallback.professional_name,
    crp: v.crp !== undefined ? emptyToNull(v.crp) : fallback.crp,
    crp_state: v.crpState !== undefined ? emptyToNull(v.crpState) : fallback.crp_state,
    professional_title:
      v.professionalTitle !== undefined ? emptyToNull(v.professionalTitle) : fallback.professional_title,
    qualifications:
      v.qualifications !== undefined ? emptyToNull(v.qualifications) : fallback.qualifications,
    professional_phone:
      v.professionalPhone !== undefined ? emptyToNull(v.professionalPhone) : fallback.professional_phone,
    professional_email:
      v.professionalEmail !== undefined ? emptyToNull(v.professionalEmail) : fallback.professional_email,
    show_clinic_name: v.showClinicName ?? fallback.show_clinic_name,
    show_trade_name: v.showTradeName ?? fallback.show_trade_name,
    show_legal_name: v.showLegalName ?? fallback.show_legal_name,
    show_address: v.showAddress ?? fallback.show_address,
    show_city: v.showCity ?? fallback.show_city,
    show_phone: v.showPhone ?? fallback.show_phone,
    show_email: v.showEmail ?? fallback.show_email,
    show_website: v.showWebsite ?? fallback.show_website,
    show_tax_id: v.showTaxId ?? fallback.show_tax_id,
    header_logo: v.headerLogo ?? fallback.header_logo,
    header_clinic: v.headerClinic ?? fallback.header_clinic,
    header_professional: v.headerProfessional ?? fallback.header_professional,
    header_crp: v.headerCrp ?? fallback.header_crp,
    header_phone: v.headerPhone ?? fallback.header_phone,
    header_email: v.headerEmail ?? fallback.header_email,
    header_address: v.headerAddress ?? fallback.header_address,
    header_website: v.headerWebsite ?? fallback.header_website,
    footer_clinic: v.footerClinic ?? fallback.footer_clinic,
    footer_professional: v.footerProfessional ?? fallback.footer_professional,
    footer_crp: v.footerCrp ?? fallback.footer_crp,
    footer_phone: v.footerPhone ?? fallback.footer_phone,
    footer_email: v.footerEmail ?? fallback.footer_email,
    footer_address: v.footerAddress ?? fallback.footer_address,
    footer_website: v.footerWebsite ?? fallback.footer_website,
    footer_page_numbers: v.footerPageNumbers ?? fallback.footer_page_numbers,
    footer_document_id: v.footerDocumentId ?? fallback.footer_document_id,
    footer_version: v.footerVersion ?? fallback.footer_version,
    footer_hash: v.footerHash ?? fallback.footer_hash,
    color_primary: v.colorPrimary ?? fallback.color_primary,
    color_secondary: v.colorSecondary ?? fallback.color_secondary,
    color_headings: v.colorHeadings ?? fallback.color_headings,
    color_dividers: v.colorDividers ?? fallback.color_dividers,
    typography_preset: v.typographyPreset ?? fallback.typography_preset,
    letterhead_preset: v.letterheadPreset ?? fallback.letterhead_preset,
    default_visual_profile: v.defaultVisualProfile ?? fallback.default_visual_profile,
    cancellation_notice_hours: v.cancellationNoticeHours ?? fallback.cancellation_notice_hours,
    adjustment_cadence: v.adjustmentCadence ?? fallback.adjustment_cadence,
    include_ai_informative_clause:
      v.includeAiInformativeClause ?? fallback.include_ai_informative_clause,
    default_logo_id: v.defaultLogoId !== undefined ? v.defaultLogoId : fallback.default_logo_id,
  };

  const supabase = await createSupabaseServerClient();
  const query = existing
    ? supabase.from("document_branding").update(row).eq("organization_id", organizationId)
    : supabase.from("document_branding").insert(row);
  const { error } = await query;
  if (error) {
    return { error: "Não foi possível salvar a identidade visual agora." };
  }
  revalidatePath("/app/settings");
  revalidatePath("/app/documents");
  return { id: organizationId };
}

export async function requestLogoUploadUrlAction(input: {
  filename: string;
  mimeType: string;
}): Promise<BrandingActionResult> {
  const { organizationId, role } = await requireOrgContext();
  if (role !== "psychologist_admin") {
    return { error: "Somente a psicóloga administradora envia logos." };
  }
  const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
  if (!allowed.includes(input.mimeType)) {
    return { error: "Use PNG, JPG, JPEG, WEBP ou SVG." };
  }
  const path = buildStoragePath(organizationId, "logos", input.filename);
  try {
    const { token } = await createSignedUploadUrl(DOCUMENT_BUCKETS.documentBranding, path);
    return { path, token };
  } catch {
    return { error: "Não foi possível preparar o envio da logo." };
  }
}

export async function registerLogoAction(input: unknown): Promise<BrandingActionResult> {
  const { organizationId, role } = await requireOrgContext();
  if (role !== "psychologist_admin") {
    return { error: "Somente a psicóloga administradora registra logos." };
  }
  const parsed = registerLogoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!isOrgScopedStoragePath(organizationId, parsed.data.storagePath)) {
    return { error: "Caminho de upload inválido." };
  }
  if (!isOrgScopedStoragePath(organizationId, parsed.data.printStoragePath)) {
    return { error: "Caminho de impressão inválido." };
  }
  const supabase = await createSupabaseServerClient();
  if (parsed.data.isDefault) {
    await supabase
      .from("document_logos")
      .update({ is_default: false })
      .eq("organization_id", organizationId)
      .eq("is_default", true);
  }
  const { data, error } = await supabase
    .from("document_logos")
    .insert({
      organization_id: organizationId,
      variant: parsed.data.variant,
      label: parsed.data.label ?? "",
      storage_path: parsed.data.storagePath,
      print_storage_path: parsed.data.printStoragePath ?? null,
      mime_type: parsed.data.mimeType,
      byte_size: parsed.data.byteSize,
      sha256: parsed.data.sha256,
      is_default: parsed.data.isDefault ?? false,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { error: "Não foi possível registrar a logo agora." };
  }
  revalidatePath("/app/settings");
  return { id: data.id };
}

export async function setDefaultLogoAction(logoId: string): Promise<BrandingActionResult> {
  const { organizationId, role } = await requireOrgContext();
  if (role !== "psychologist_admin") {
    return { error: "Somente a psicóloga administradora define a logo padrão." };
  }
  const logo = await getDocumentLogo(organizationId, logoId);
  if (!logo) return { error: "Logo não encontrada." };
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("document_logos")
    .update({ is_default: false })
    .eq("organization_id", organizationId);
  await supabase.from("document_logos").update({ is_default: true }).eq("id", logoId);
  await supabase
    .from("document_branding")
    .update({ default_logo_id: logoId })
    .eq("organization_id", organizationId);
  revalidatePath("/app/settings");
  return { id: logoId };
}

export async function requestLogoPreviewUrlAction(logoId: string): Promise<BrandingActionResult> {
  const { organizationId } = await requireOrgContext();
  const logo = await getDocumentLogo(organizationId, logoId);
  if (!logo) return { error: "Logo não encontrada." };
  try {
    const url = await createSignedDownloadUrl(
      DOCUMENT_BUCKETS.documentBranding,
      logo.print_storage_path || logo.storage_path,
    );
    return { url };
  } catch {
    return { error: "Não foi possível gerar o preview da logo." };
  }
}
