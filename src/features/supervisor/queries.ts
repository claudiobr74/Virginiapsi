import "server-only";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const supervisorRunRowSchema = z.object({
  id: z.string().uuid(),
  patient_id: z.string().uuid().nullable(),
  model: z.string(),
  prompt_version: z.string(),
  schema_version: z.string(),
  status: z.enum(["running", "succeeded", "failed"]),
  source_ids: z.unknown().nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
});
export type SupervisorRunRow = z.infer<typeof supervisorRunRowSchema>;

export const supervisorArtifactRowSchema = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid(),
  structured_content: z.unknown(),
  review_status: z.enum(["pending", "appended", "discarded"]),
  created_at: z.string(),
});
export type SupervisorArtifactRow = z.infer<typeof supervisorArtifactRowSchema>;

/** History of past supervisions for a patient (docs/01 §8 "histórico de supervisões"). */
export async function listSupervisorRuns(
  organizationId: string,
  patientId: string,
): Promise<SupervisorRunRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_runs")
    .select("id, patient_id, model, prompt_version, schema_version, status, source_ids, created_at, completed_at")
    .eq("organization_id", organizationId)
    .eq("patient_id", patientId)
    .eq("purpose", "supervisor")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`failed to list supervisor runs: ${error.message}`);
  }
  return supervisorRunRowSchema.array().parse(data ?? []);
}

export async function getSupervisorArtifactForRun(
  runId: string,
): Promise<SupervisorArtifactRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_artifacts")
    .select("id, run_id, structured_content, review_status, created_at")
    .eq("run_id", runId)
    .eq("type", "supervisor")
    .maybeSingle();

  if (error) {
    throw new Error(`failed to load supervisor artifact: ${error.message}`);
  }
  return data ? supervisorArtifactRowSchema.parse(data) : null;
}
