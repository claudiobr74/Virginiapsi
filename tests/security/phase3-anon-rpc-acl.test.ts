import { describe, expect, it } from "vitest";
import { runAsAdmin } from "./support/db";

const AUTHENTICATED_RPCS = [
  "accept_pending_invitations",
  "add_platform_operator",
  "bootstrap_organization",
  "claim_platform_operator",
  "disconnect_google_calendar",
  "enqueue_appointment_whatsapp_reminders",
  "ensure_whatsapp_templates",
  "get_google_credentials",
  "invite_organization_member",
  "log_audit_event",
  "log_calendar_sync_event",
  "log_patient_audit_event",
] as const;

const INTERNAL_RPCS = [
  "expire_stale_logical_exports",
  "purge_expired_fallback_audio",
  "rls_auto_enable",
] as const;

describe("phase 3 anonymous SECURITY DEFINER RPC ACL", () => {
  it("removes anon execution while preserving authenticated application RPC access", async () => {
    const rows = await runAsAdmin(async (client) => {
      const result = await client.query<{
        function_name: string;
        anon_exec: boolean;
        authenticated_exec: boolean;
        service_exec: boolean;
      }>(`
        select
          p.proname as function_name,
          has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec,
          has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = any($1::text[])
        order by p.proname;
      `, [AUTHENTICATED_RPCS]);
      return result.rows;
    });

    expect(rows).toHaveLength(AUTHENTICATED_RPCS.length);
    for (const row of rows) {
      expect(row.anon_exec, row.function_name).toBe(false);
      expect(row.authenticated_exec, row.function_name).toBe(true);
      expect(row.service_exec, row.function_name).toBe(true);
    }
  });

  it("keeps internal jobs and event helper unavailable to API clients", async () => {
    const rows = await runAsAdmin(async (client) => {
      const result = await client.query<{
        function_name: string;
        anon_exec: boolean;
        authenticated_exec: boolean;
      }>(`
        select
          p.proname as function_name,
          has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = any($1::text[])
        order by p.proname;
      `, [INTERNAL_RPCS]);
      return result.rows;
    });

    expect(rows).toHaveLength(INTERNAL_RPCS.length);
    for (const row of rows) {
      expect(row.anon_exec, row.function_name).toBe(false);
      expect(row.authenticated_exec, row.function_name).toBe(false);
    }
  });
});
