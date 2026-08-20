import { sha256Hex } from "@/lib/documents/storage-meta";
import { buildZipStore } from "@/lib/export/zip-store";
import {
  EXPORT_SCHEMA_VERSION,
  type ExportManifest,
  type ExportManifestFile,
  type LogicalExportScope,
} from "@/features/settings/contracts";

export interface PackedExport {
  zip: Buffer;
  manifest: ExportManifest;
  manifestBytes: Buffer;
  packageSha256: string;
  manifestSha256: string;
}

const TABLE_SPECS = [
  { file: "data/patients.json", table: "patients" },
  { file: "data/patient_clinical_profile.json", table: "patient_clinical_profile" },
  { file: "data/appointments.json", table: "appointments" },
  { file: "data/consents.json", table: "consents" },
  { file: "data/communication_preferences.json", table: "communication_preferences" },
  { file: "data/clinical_sessions.json", table: "clinical_sessions" },
  { file: "data/session_dpep.json", table: "session_dpep" },
  { file: "data/session_clinical_working_notes.json", table: "session_clinical_working_notes" },
  { file: "data/session_transcript_segments.json", table: "session_transcript_segments" },
  { file: "data/documents.json", table: "documents" },
  { file: "data/patient_attachments.json", table: "patient_attachments" },
  { file: "data/financial_charges.json", table: "financial_charges" },
  { file: "data/financial_payments.json", table: "financial_payments" },
  { file: "data/whatsapp_messages.json", table: "whatsapp_messages" },
] as const;

type Row = Record<string, unknown>;

export interface ExportQueryClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function patientsToCsv(patients: Row[]): string {
  const headers = [
    "public_code",
    "preferred_name",
    "full_name",
    "email",
    "phone",
    "status",
    "elimination_status",
  ];
  const lines = [headers.join(",")];
  for (const patient of patients) {
    lines.push(
      headers.map((header) => csvEscape(String(patient[header] ?? ""))).join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

function asRows(data: unknown[] | null): Row[] {
  return Array.isArray(data) ? (data as Row[]) : [];
}

function filterPatientScope(
  table: string,
  rows: Row[],
  patientId: string,
  sessionIds: Set<string>,
  chargeIds: Set<string>,
): Row[] {
  if (table === "patients") {
    return rows.filter((row) => row.id === patientId);
  }
  if (
    table === "session_dpep" ||
    table === "session_clinical_working_notes" ||
    table === "session_transcript_segments"
  ) {
    return rows.filter((row) => sessionIds.has(String(row.session_id ?? "")));
  }
  if (table === "financial_payments") {
    return rows.filter((row) => chargeIds.has(String(row.charge_id ?? "")));
  }
  if ("patient_id" in (rows[0] ?? { patient_id: null }) || rows.length === 0) {
    return rows.filter((row) => row.patient_id === patientId);
  }
  return rows;
}

export async function packLogicalExport(input: {
  supabase: ExportQueryClient;
  organizationId: string;
  organizationName: string;
  actorUserId: string;
  scope: LogicalExportScope;
  patientId: string | null;
  patientPublicCode: string | null;
  exportedAt?: string;
}): Promise<PackedExport> {
  const files: { path: string; bytes: Buffer }[] = [];

  const org = await input.supabase
    .from("organizations")
    .select("id, name, slug, timezone, status")
    .eq("id", input.organizationId);
  files.push({ path: "data/organization.json", bytes: jsonBytes(org.data ?? []) });

  const settings = await input.supabase
    .from("practice_settings")
    .select(
      "organization_id, professional_name, subtitle, crp, clinic_name, company_name, greeting_prefix, quote, session_duration_minutes, inactivity_timeout_minutes, secretary_finance_access, session_audio_fallback_retention_days, transcript_retention_policy, transcript_retention_fixed_days, clinical_record_minimum_retention_years",
    )
    .eq("organization_id", input.organizationId);
  files.push({
    path: "data/practice_settings.json",
    bytes: jsonBytes(settings.data ?? []),
  });

  const collected: Record<string, Row[]> = {};
  for (const spec of TABLE_SPECS) {
    const result = await input.supabase
      .from(spec.table)
      .select("*")
      .eq("organization_id", input.organizationId);
    collected[spec.table] = asRows(result.data);
  }

  const sessionIds = new Set(
    (collected.clinical_sessions ?? [])
      .filter((row) => !input.patientId || row.patient_id === input.patientId)
      .map((row) => String(row.id)),
  );
  const chargeIds = new Set(
    (collected.financial_charges ?? [])
      .filter((row) => !input.patientId || row.patient_id === input.patientId)
      .map((row) => String(row.id)),
  );

  for (const spec of TABLE_SPECS) {
    let rows = collected[spec.table] ?? [];
    if (input.scope === "patient" && input.patientId) {
      rows = filterPatientScope(spec.table, rows, input.patientId, sessionIds, chargeIds);
    }
    files.push({ path: spec.file, bytes: jsonBytes(rows) });
  }

  const patients = JSON.parse(
    files.find((file) => file.path === "data/patients.json")?.bytes.toString("utf8") ?? "[]",
  ) as Row[];
  files.push({
    path: "data/patients.csv",
    bytes: Buffer.from(patientsToCsv(patients), "utf8"),
  });

  const manifestFiles: ExportManifestFile[] = files.map((file) => ({
    path: file.path,
    sha256: sha256Hex(file.bytes),
    bytes: file.bytes.length,
  }));

  const manifest: ExportManifest = {
    schema_version: EXPORT_SCHEMA_VERSION,
    exported_at: input.exportedAt ?? new Date().toISOString(),
    organization_id: input.organizationId,
    organization_name: input.organizationName,
    actor_user_id: input.actorUserId,
    scope: input.scope,
    patient_id: input.patientId,
    patient_public_code: input.patientPublicCode,
    files: manifestFiles,
  };

  const manifestBytes = jsonBytes(manifest);
  const zip = buildZipStore([
    { name: "manifest.json", data: manifestBytes },
    ...files.map((file) => ({ name: file.path, data: file.bytes })),
  ]);

  return {
    zip,
    manifest,
    manifestBytes,
    packageSha256: sha256Hex(zip),
    manifestSha256: sha256Hex(manifestBytes),
  };
}
