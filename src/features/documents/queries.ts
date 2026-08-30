import "server-only";

import {
  documentDeliveryRowSchema,
  documentFileRowSchema,
  documentRowSchema,
  documentTemplateRowSchema,
  documentVersionRowSchema,
  patientAttachmentRowSchema,
  type DocumentDeliveryRow,
  type DocumentFileRow,
  type DocumentRow,
  type DocumentTemplateRow,
  type DocumentVersionRow,
  type PatientAttachmentRow,
} from "@/features/documents/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function listTemplates(organizationId: string): Promise<DocumentTemplateRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("document_templates")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) throw new Error(`failed to list document templates: ${error.message}`);
  return documentTemplateRowSchema.array().parse(data ?? []);
}

export async function listDocuments(
  organizationId: string,
  filters: { patientId?: string } = {},
): Promise<DocumentRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("documents")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (filters.patientId) {
    query = query.eq("patient_id", filters.patientId);
  }
  const { data, error } = await query;
  if (error) throw new Error(`failed to list documents: ${error.message}`);
  return documentRowSchema.array().parse(data ?? []);
}

export async function listRecentDocuments(
  organizationId: string,
  limit = 8,
): Promise<DocumentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("organization_id", organizationId)
    .neq("status", "canceled")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`failed to list recent documents: ${error.message}`);
  return documentRowSchema.array().parse(data ?? []);
}

export async function getDocument(
  organizationId: string,
  documentId: string,
): Promise<DocumentRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    throw new Error(`failed to load document: ${error.message}`);
  }
  if (!data) return null;
  const doc = documentRowSchema.parse(data);
  return doc.organization_id === organizationId ? doc : null;
}

export async function listVersions(documentId: string): Promise<DocumentVersionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("document_versions")
    .select(
      "id, document_id, version, body_snapshot, variables_snapshot, created_at, sections_snapshot, content_sha256",
    )
    .eq("document_id", documentId)
    .order("version", { ascending: false });
  if (error) throw new Error(`failed to list document versions: ${error.message}`);
  return documentVersionRowSchema.array().parse(
    (data ?? []).map((row) => ({
      ...row,
      sections_snapshot: Array.isArray(row.sections_snapshot) ? row.sections_snapshot : [],
      variables_snapshot:
        row.variables_snapshot && typeof row.variables_snapshot === "object"
          ? Object.fromEntries(
              Object.entries(row.variables_snapshot as Record<string, unknown>).map(([key, value]) => [
                key,
                String(value ?? ""),
              ]),
            )
          : {},
    })),
  );
}

export async function getLatestVersion(documentId: string): Promise<DocumentVersionRow | null> {
  const versions = await listVersions(documentId);
  return versions[0] ?? null;
}

export async function getFileForVersion(
  documentVersionId: string,
): Promise<DocumentFileRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("document_files")
    .select("*")
    .eq("document_version_id", documentVersionId)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    throw new Error(`failed to load document file: ${error.message}`);
  }
  return data ? documentFileRowSchema.parse(data) : null;
}

export async function listPatientAttachments(
  organizationId: string,
  patientId: string,
): Promise<PatientAttachmentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patient_attachments")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`failed to list patient attachments: ${error.message}`);
  return patientAttachmentRowSchema.array().parse(data ?? []);
}

export async function listDocumentDeliveries(documentId: string): Promise<DocumentDeliveryRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("document_delivery")
    .select("*")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`failed to list document deliveries: ${error.message}`);
  return documentDeliveryRowSchema.array().parse(data ?? []);
}
