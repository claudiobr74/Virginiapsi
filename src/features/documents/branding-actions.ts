"use server";

import { revalidatePath } from "next/cache";
import {
  registerLogoSchema,
  updateBrandingSchema,
} from "@/features/documents/branding-contracts";
import { buildDocumentBrandingPersistRow } from "@/features/documents/branding-form";
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

export async function upsertDocumentBrandingAction(input: unknown): Promise<BrandingActionResult> {
  const { organizationId, role } = await requireOrgContext();
  if (role !== "psychologist_admin") {
    return { error: "Somente a psicóloga administradora configura a identidade visual." };
  }
  const parsed = updateBrandingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const existing = await getDocumentBranding(organizationId);
  const fallback = existing ?? defaultBranding();
  const row = buildDocumentBrandingPersistRow(parsed.data, fallback, organizationId);

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
