import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const migration = readFileSync(
  path.join(
    ROOT,
    "supabase/migrations/20260905213000_phase6_restrict_anon_security_definer_rpc.sql",
  ),
  "utf8",
);

const functions = [
  "can_access_clinical_session(uuid, uuid)",
  "can_access_document(uuid, uuid, public.document_sensitivity)",
  "can_access_patient_clinical(uuid, uuid)",
  "can_access_patient_record(uuid, uuid)",
  "can_manage_org_patients(uuid)",
  "can_read_finance(uuid)",
  "can_write_finance(uuid)",
  "finance_period_is_closed(uuid, date)",
  "has_org_role(uuid, text[])",
  "is_clinical_practitioner(uuid)",
  "is_org_member(uuid)",
  "is_platform_operator()",
  "is_psychologist_admin(uuid)",
  "list_assignable_psychologists(uuid)",
  "list_organization_members(uuid)",
  "patient_whatsapp_allowed(uuid, uuid)",
  "platform_bootstrap_state()",
  "secretary_finance_access(uuid)",
];

describe("phase 6A anon SECURITY DEFINER RPC hardening", () => {
  it("revokes anon execute for every targeted helper", () => {
    for (const fn of functions) {
      expect(migration).toContain(
        `revoke execute on function public.${fn} from anon;`,
      );
    }
  });

  it("does not revoke authenticated or service_role execution", () => {
    expect(migration).not.toMatch(/from\s+authenticated/i);
    expect(migration).not.toMatch(/from\s+service_role/i);
  });

  it("does not alter function definitions or authorization predicates", () => {
    expect(migration).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
    expect(migration).not.toMatch(/alter\s+function/i);
  });
});
