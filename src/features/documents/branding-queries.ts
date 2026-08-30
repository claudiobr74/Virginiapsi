import "server-only";

import {
  documentBrandingRowSchema,
  documentLogoRowSchema,
  type DocumentBrandingRow,
  type DocumentLogoRow,
} from "@/features/documents/branding-contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getDocumentBranding(
  organizationId: string,
): Promise<DocumentBrandingRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("document_branding")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) {
    return null;
  }
  if (!data) return null;
  return documentBrandingRowSchema.parse(data);
}

export async function listDocumentLogos(organizationId: string): Promise<DocumentLogoRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("document_logos")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return documentLogoRowSchema.array().parse(data ?? []);
}

export async function getDocumentLogo(
  organizationId: string,
  logoId: string,
): Promise<DocumentLogoRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("document_logos")
    .select("*")
    .eq("id", logoId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    throw new Error(`failed to load document logo: ${error.message}`);
  }
  return data ? documentLogoRowSchema.parse(data) : null;
}

export async function listTemplateFavorites(
  organizationId: string,
  userId: string,
): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("document_template_favorites")
    .select("template_key")
    .eq("organization_id", organizationId)
    .eq("user_id", userId);
  if (error) return [];
  return (data ?? []).map((row) => row.template_key as string);
}
