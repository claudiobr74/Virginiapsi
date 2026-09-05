import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const migration = readFileSync(
  path.join(
    ROOT,
    "supabase/migrations/20260905210000_phase5_db_hot_path_performance.sql",
  ),
  "utf8",
);

describe("phase 5 database hot-path performance", () => {
  it("adds only targeted FK/tenant indexes for critical paths", () => {
    for (const indexName of [
      "patients_responsible_psychologist_user_idx",
      "clinical_sessions_patient_fk_idx",
      "clinical_sessions_therapist_user_idx",
      "session_meet_bindings_organization_idx",
      "session_meet_transcript_entries_organization_idx",
      "session_transcript_artifacts_session_idx",
      "session_transcript_artifacts_organization_idx",
      "session_transcript_segments_organization_idx",
      "knowledge_chunks_organization_idx",
      "knowledge_embeddings_organization_idx",
      "financial_charges_plan_idx",
      "financial_plans_organization_idx",
    ]) {
      expect(migration).toContain(`create index if not exists ${indexName}`);
    }
  });

  it("uses initplan-safe auth.uid without changing helper predicates", () => {
    expect(migration).toContain("(select auth.uid())");
    expect(migration).not.toMatch(/=\s*auth\.uid\(\)/);
    expect(migration).toContain("public.is_org_member(organization_id)");
    expect(migration).toContain("public.can_manage_org_patients(organization_id)");
    expect(migration).toContain("public.is_clinical_practitioner(organization_id)");
    expect(migration).toContain("public.is_psychologist_admin(organization_id)");
    expect(migration).toContain("public.is_platform_operator()");
  });

  it("keeps optimized policies authenticated-only", () => {
    expect(migration).not.toMatch(/to\s+anon/i);
    expect(migration.match(/to authenticated/g)?.length).toBe(9);
  });
});
