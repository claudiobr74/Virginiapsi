import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { bootstrapOrganization, createAuthUser, openSession } from "./support/db";

const MIGRATION = path.resolve(
  __dirname,
  "../../supabase/migrations/20260901160000_revoke_anon_organization_shell_settings.sql",
);

describe("organization_shell_settings — EXECUTE ACL", () => {
  let admin: string;
  let organizationId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Consultório ACL Shell");
  });

  it("a migration só revoga anon; não recria nem altera o body da função", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const statements = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(statements).toMatch(
      /revoke execute on function public\.organization_shell_settings\(uuid\) from anon;/i,
    );
    expect(statements).toMatch(
      /grant execute on function public\.organization_shell_settings\(uuid\) to authenticated;/i,
    );
    expect(statements).toMatch(
      /grant execute on function public\.organization_shell_settings\(uuid\) to service_role;/i,
    );
    expect(statements).not.toMatch(/create or replace function/i);
    expect(statements).not.toMatch(/alter function/i);
    expect(statements).not.toMatch(/security\s+invoker/i);
    expect(statements).not.toMatch(/search_path/i);
  });

  it("o catálogo nega EXECUTE a anon e concede a authenticated e service_role", async () => {
    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{
        proname: string;
        prosecdef: boolean;
        proconfig: string[] | null;
        anon_exec: boolean;
        authenticated_exec: boolean;
        service_role_exec: boolean;
      }>(
        `select
           p.proname,
           p.prosecdef,
           p.proconfig,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec,
           has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_exec
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'organization_shell_settings'`,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].prosecdef).toBe(true);
      expect(rows[0].proconfig).toContain('search_path=""');
      expect(rows[0].anon_exec).toBe(false);
      expect(rows[0].authenticated_exec).toBe(true);
      expect(rows[0].service_role_exec).toBe(true);

      const grants = await session.query<{ grantee: string }>(
        `select a.grantee::regrole::text as grantee
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         cross join aclexplode(p.proacl) a
         where n.nspname = 'public'
           and p.proname = 'organization_shell_settings'
           and a.privilege_type = 'EXECUTE'`,
      );
      const grantees = new Set(grants.map((row) => row.grantee));
      expect(grantees.has("anon")).toBe(false);
      expect(grantees.has("-")).toBe(false);
      expect(grantees.has("authenticated")).toBe(true);
      expect(grantees.has("service_role")).toBe(true);
    } finally {
      await session.close();
    }
  });

  it("sessão anon recebe permission denied ao executar a função", async () => {
    const session = await openSession({ role: "anon" });
    try {
      const error = await session.expectError(
        "select * from public.organization_shell_settings($1)",
        [organizationId],
      );
      expect(error).toMatch(/permission denied/i);
    } finally {
      await session.close();
    }
  });

  it("membro autenticado executa a função no próprio tenant", async () => {
    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{ organization_id: string }>(
        "select organization_id from public.organization_shell_settings($1)",
        [organizationId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].organization_id).toBe(organizationId);
    } finally {
      await session.close();
    }
  });

  it("anon também é negado com org_id aleatório — falha de EXECUTE, não de membership", async () => {
    const session = await openSession({ role: "anon" });
    try {
      const stray = await session.expectError(
        "select * from public.organization_shell_settings($1)",
        [randomUUID()],
      );
      expect(stray).toMatch(/permission denied/i);
    } finally {
      await session.close();
    }
  });
});
