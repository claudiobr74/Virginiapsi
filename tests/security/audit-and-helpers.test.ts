import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  bootstrapOrganization,
  createAuthUser,
  openSession,
} from "./support/db";

describe("audit_events é append-only", () => {
  let admin: string;
  let organizationId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Consultório Auditoria");
  });

  it("nenhum papel de aplicação tem INSERT direto", async () => {
    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        "insert into public.audit_events (organization_id, actor_user_id, action, resource_type) values ($1, $2, 'forged', 'organization')",
        [organizationId, admin],
      );
      expect(error).toMatch(/permission denied|violates row-level security/i);
    } finally {
      await session.close();
    }
  });

  it("nem o admin consegue UPDATE ou DELETE na trilha", async () => {
    const session = await openSession({ userId: admin });
    try {
      const updateError = await session.expectError(
        "update public.audit_events set action = 'rewritten' where organization_id = $1",
        [organizationId],
      );
      expect(updateError).toMatch(/permission denied/i);

      const deleteError = await session.expectError(
        "delete from public.audit_events where organization_id = $1",
        [organizationId],
      );
      expect(deleteError).toMatch(/permission denied/i);
    } finally {
      await session.close();
    }
  });

  it("a função de log força o ator autenticado e a organização do membro", async () => {
    const secretary = await createAuthUser();
    await addMember(admin, organizationId, secretary, "secretary");

    const session = await openSession({ userId: secretary });
    try {
      const rows = await session.query<{ id: string }>(
        "select public.log_audit_event($1, 'patient.view', 'patient', 'PAC-001', $2::jsonb) as id",
        [organizationId, JSON.stringify({ source: "test" })],
      );
      expect(rows[0].id).toBeTruthy();
    } finally {
      await session.close();
    }

    const adminSession = await openSession({ userId: admin });
    try {
      const events = await adminSession.query<{
        actor_user_id: string;
        action: string;
        metadata: Record<string, unknown>;
      }>(
        "select actor_user_id, action, metadata from public.audit_events where organization_id = $1 and action = 'patient.view'",
        [organizationId],
      );
      expect(events).toHaveLength(1);
      // O ator vem de auth.uid(), não de parâmetro do cliente.
      expect(events[0].actor_user_id).toBe(secretary);
      expect(events[0].metadata).toEqual({ source: "test" });
    } finally {
      await adminSession.close();
    }
  });

  it("a trilha registra o bootstrap da organização", async () => {
    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{ action: string; actor_user_id: string }>(
        "select action, actor_user_id from public.audit_events where organization_id = $1 and action = 'organization.bootstrap'",
        [organizationId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_user_id).toBe(admin);
    } finally {
      await session.close();
    }
  });
});

describe("hardening dos helpers de RLS", () => {
  it("são STABLE, SECURITY DEFINER e com search_path vazio", async () => {
    const session = await openSession({ userId: await createAuthUser() });
    try {
      const rows = await session.query<{
        proname: string;
        provolatile: string;
        prosecdef: boolean;
        proconfig: string[] | null;
      }>(
        `select p.proname, p.provolatile, p.prosecdef, p.proconfig
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in (
             'is_org_member',
             'has_org_role',
             'is_psychologist_admin',
             'secretary_finance_access',
             'organization_shell_settings'
           )
         order by p.proname`,
      );

      expect(rows).toHaveLength(5);
      for (const row of rows) {
        expect(row.provolatile, `${row.proname} deve ser STABLE`).toBe("s");
        expect(row.prosecdef, `${row.proname} deve ser SECURITY DEFINER`).toBe(true);
        expect(
          row.proconfig,
          `${row.proname} deve fixar search_path vazio`,
        ).toContain('search_path=""');
      }
    } finally {
      await session.close();
    }
  });

  it("não concedem EXECUTE a public nem a anon", async () => {
    const session = await openSession({ userId: await createAuthUser() });
    try {
      const rows = await session.query<{ proname: string; grantee: string }>(
        `select p.proname, a.grantee::regrole::text as grantee
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         cross join aclexplode(p.proacl) a
         where n.nspname = 'public'
           and p.proname in (
             'is_org_member',
             'has_org_role',
             'is_psychologist_admin',
             'secretary_finance_access',
             'organization_shell_settings',
             'log_audit_event',
             'bootstrap_organization'
           )
           and a.privilege_type = 'EXECUTE'`,
      );

      const grantees = new Set(rows.map((row) => row.grantee));
      expect(grantees.has("anon")).toBe(false);
      expect(grantees.has("-")).toBe(false); // PUBLIC
      expect(grantees.has("authenticated")).toBe(true);
    } finally {
      await session.close();
    }
  });

  it("as policies usam helpers sem recursão infinita", async () => {
    // Uma consulta em organization_members cujo policy chama
    // is_psychologist_admin (que lê a própria tabela) só termina porque o
    // helper é SECURITY DEFINER. Se recursasse, isto estouraria.
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Recursão");
    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query(
        "select id from public.organization_members where organization_id = $1",
        [organizationId],
      );
      expect(rows).toHaveLength(1);
    } finally {
      await session.close();
    }
  });

  it("todas as tabelas de tenant têm RLS habilitada", async () => {
    const session = await openSession({ userId: await createAuthUser() });
    try {
      const rows = await session.query<{ relname: string; relrowsecurity: boolean }>(
        `select c.relname, c.relrowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'
         order by c.relname`,
      );

      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.relrowsecurity, `${row.relname} sem RLS`).toBe(true);
      }
    } finally {
      await session.close();
    }
  });
});

describe("bootstrap de organização", () => {
  it("cria organização, membership admin, settings e auditoria numa transação", async () => {
    const user = await createAuthUser();
    const organizationId = await bootstrapOrganization(user, "Consultório Novo");

    const session = await openSession({ userId: user });
    try {
      const org = await session.query<{ id: string; status: string; timezone: string }>(
        "select id, status, timezone from public.organizations where id = $1",
        [organizationId],
      );
      expect(org[0].status).toBe("active");
      expect(org[0].timezone).toBe("America/Sao_Paulo");

      const membership = await session.query<{ role: string; active: boolean }>(
        "select role, active from public.organization_members where organization_id = $1 and user_id = $2",
        [organizationId, user],
      );
      expect(membership[0]).toMatchObject({ role: "psychologist_admin", active: true });

      const settings = await session.query<{ secretary_finance_access: string }>(
        "select secretary_finance_access from public.practice_settings where organization_id = $1",
        [organizationId],
      );
      expect(settings[0].secretary_finance_access).toBe("none");
    } finally {
      await session.close();
    }
  });

  it("rejeita slug duplicado sem deixar organização órfã", async () => {
    const first = await createAuthUser();
    const second = await createAuthUser();

    const firstSession = await openSession({ userId: first });
    let slug = "";
    try {
      slug = `dup-${Date.now()}`;
      await firstSession.query("select public.bootstrap_organization($1, $2)", [
        "Primeira",
        slug,
      ]);
    } finally {
      await firstSession.close();
    }

    const secondSession = await openSession({ userId: second });
    try {
      const error = await secondSession.expectError(
        "select public.bootstrap_organization($1, $2)",
        ["Segunda", slug],
      );
      expect(error).toMatch(/duplicate key|unique/i);
      expect(await secondSession.query("select id from public.organizations")).toEqual([]);
    } finally {
      await secondSession.close();
    }
  });

  it("a organização mantém pelo menos um admin ativo", async () => {
    const admin = await createAuthUser();
    const secretary = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Último Admin");
    await addMember(admin, organizationId, secretary, "secretary");

    const session = await openSession({ userId: admin });
    try {
      const demotion = await session.expectError(
        "update public.organization_members set role = 'secretary' where organization_id = $1 and user_id = $2",
        [organizationId, admin],
      );
      expect(demotion).toMatch(/at least one active psychologist_admin/i);

      const deactivation = await session.expectError(
        "update public.organization_members set active = false where organization_id = $1 and user_id = $2",
        [organizationId, admin],
      );
      expect(deactivation).toMatch(/at least one active psychologist_admin/i);

      const removal = await session.expectError(
        "delete from public.organization_members where organization_id = $1 and user_id = $2",
        [organizationId, admin],
      );
      expect(removal).toMatch(/at least one active psychologist_admin/i);
    } finally {
      await session.close();
    }
  });
});
