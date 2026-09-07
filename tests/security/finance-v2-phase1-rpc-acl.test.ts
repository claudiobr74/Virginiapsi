import { describe, expect, it } from "vitest";
import { openSession } from "./support/db";

describe("Financeiro v2 — F1 ACL das RPCs", () => {
  it("anon não pode executar RPCs financeiras e authenticated mantém acesso", async () => {
    const anon = await openSession({ role: "anon" });
    const authenticated = await openSession({ role: "authenticated" });
    try {
      const anonSessionChargeError = await anon.expectError(
        "select public.create_session_charge(gen_random_uuid(), gen_random_uuid())",
      );
      expect(anonSessionChargeError.toLowerCase()).toContain("permission denied");

      const anonPlanError = await anon.expectError(
        "select public.create_financial_plan_with_initial_charge(gen_random_uuid(), gen_random_uuid(), 'monthly', null, 100.00, null, null, 'acl-test')",
      );
      expect(anonPlanError.toLowerCase()).toContain("permission denied");

      const authSessionChargeError = await authenticated.expectError(
        "select public.create_session_charge(gen_random_uuid(), gen_random_uuid())",
      );
      expect(authSessionChargeError.toLowerCase()).not.toContain("permission denied for function");

      const authPlanError = await authenticated.expectError(
        "select public.create_financial_plan_with_initial_charge(gen_random_uuid(), gen_random_uuid(), 'monthly', null, 100.00, null, null, 'acl-test')",
      );
      expect(authPlanError.toLowerCase()).not.toContain("permission denied for function");
    } finally {
      await anon.close();
      await authenticated.close();
    }
  });
});
