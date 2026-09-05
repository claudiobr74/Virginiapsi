import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAuthUser, openSession, runAsAdmin } from "./support/db";

describe("phase 3 sensitive SECURITY DEFINER RPC ACL", () => {
  it("removes API execution from internal patient-code and retention helpers", async () => {
    const rows = await runAsAdmin(async (client) => {
      const result = await client.query<{
        function_name: string;
        anon_exec: boolean;
        authenticated_exec: boolean;
        service_exec: boolean;
      }>(`
        select
          p.oid::regprocedure::text as function_name,
          has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec,
          has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('next_patient_public_code', 'invoke_audio_retention_job')
        order by 1;
      `);
      return result.rows;
    });

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.anon_exec).toBe(false);
      expect(row.authenticated_exec).toBe(false);
      expect(row.service_exec).toBe(true);
    }
  });

  it("denies anonymous WhatsApp outbox resync while preserving authenticated RPC access", async () => {
    const rows = await runAsAdmin(async (client) => {
      const result = await client.query<{
        anon_exec: boolean;
        authenticated_exec: boolean;
        service_exec: boolean;
      }>(`
        select
          has_function_privilege('anon', 'public.sync_patient_whatsapp_outbox(uuid)', 'EXECUTE') as anon_exec,
          has_function_privilege('authenticated', 'public.sync_patient_whatsapp_outbox(uuid)', 'EXECUTE') as authenticated_exec,
          has_function_privilege('service_role', 'public.sync_patient_whatsapp_outbox(uuid)', 'EXECUTE') as service_exec;
      `);
      return result.rows;
    });

    expect(rows[0]).toEqual({
      anon_exec: false,
      authenticated_exec: true,
      service_exec: true,
    });

    const anon = await openSession();
    try {
      const error = await anon.expectError(
        "select public.sync_patient_whatsapp_outbox($1)",
        [randomUUID()],
      );
      expect(error).toMatch(/permission denied|not authorized/i);
    } finally {
      await anon.close();
    }

    const userId = await createAuthUser();
    const authenticated = await openSession({ userId });
    try {
      await authenticated.query(
        "select public.sync_patient_whatsapp_outbox($1)",
        [randomUUID()],
      );
    } finally {
      await authenticated.close();
    }
  });
});
