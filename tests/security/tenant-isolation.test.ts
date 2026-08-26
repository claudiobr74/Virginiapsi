import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  bootstrapOrganization,
  createAuthUser,
  openSession,
} from "./support/db";

describe("isolamento de tenant", () => {
  let adminA: string;
  let adminB: string;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    adminA = await createAuthUser();
    adminB = await createAuthUser();
    orgA = await bootstrapOrganization(adminA, "Consultório A");
    orgB = await bootstrapOrganization(adminB, "Consultório B");
  });

  it("sessão anônima não tem privilégio algum nas tabelas de tenant", async () => {
    const anon = await openSession();
    try {
      // `anon` não recebe GRANT nas tabelas de tenant, então a negação vem
      // antes da RLS — a barreira é dupla, não só de linha.
      for (const table of [
        "public.organizations",
        "public.organization_members",
        "public.practice_settings",
        "public.audit_events",
      ]) {
        const error = await anon.expectError(`select * from ${table}`);
        expect(error).toMatch(/permission denied/i);
      }

      const insertError = await anon.expectError(
        "insert into public.organizations (name, slug) values ('Invasor', 'invasor')",
      );
      expect(insertError).toMatch(/permission denied|violates row-level security/i);

      const rpcError = await anon.expectError(
        "select public.bootstrap_organization('Invasor', 'invasor-2')",
      );
      expect(rpcError).toMatch(/permission denied/i);
    } finally {
      await anon.close();
    }
  });

  it("usuário autenticado sem membership não vê nenhuma organização", async () => {
    const outsider = await createAuthUser();
    const session = await openSession({ userId: outsider });
    try {
      expect(await session.query("select id from public.organizations")).toEqual([]);
      expect(await session.query("select id from public.audit_events")).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("membro de A não lê dados de B", async () => {
    const session = await openSession({ userId: adminA });
    try {
      const orgs = await session.query<{ id: string }>(
        "select id from public.organizations",
      );
      expect(orgs.map((row) => row.id)).toEqual([orgA]);

      const settings = await session.query<{ organization_id: string }>(
        "select organization_id from public.practice_settings",
      );
      expect(settings.map((row) => row.organization_id)).toEqual([orgA]);

      const crossTenant = await session.query(
        "select id from public.organizations where id = $1",
        [orgB],
      );
      expect(crossTenant).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("membro de A não escreve em B mesmo informando o organization_id de B", async () => {
    const session = await openSession({ userId: adminA });
    try {
      const updated = await session.query(
        "update public.organizations set name = 'Invadida' where id = $1 returning id",
        [orgB],
      );
      expect(updated).toEqual([]);

      const settingsUpdate = await session.query(
        "update public.practice_settings set secretary_finance_access = 'manage' where organization_id = $1 returning organization_id",
        [orgB],
      );
      expect(settingsUpdate).toEqual([]);

      const memberInsert = await session.expectError(
        "insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'secretary')",
        [orgB, adminA],
      );
      expect(memberInsert).toMatch(/violates row-level security/i);

      const auditForge = await session.expectError(
        "select public.log_audit_event($1, 'forge', 'organization')",
        [orgB],
      );
      expect(auditForge).toMatch(/active membership/i);
    } finally {
      await session.close();
    }
  });

  it("claims de um usuário inexistente não concedem acesso", async () => {
    const session = await openSession({
      userId: "00000000-0000-4000-8000-000000000000",
    });
    try {
      expect(await session.query("select id from public.organizations")).toEqual([]);
      const error = await session.expectError(
        "select public.log_audit_event($1, 'forge', 'organization')",
        [orgA],
      );
      expect(error).toMatch(/active membership/i);
    } finally {
      await session.close();
    }
  });

  it("membership inativa deixa de conceder acesso", async () => {
    const secretary = await createAuthUser();
    await addMember(adminA, orgA, secretary, "secretary");

    const active = await openSession({ userId: secretary });
    try {
      const orgs = await active.query<{ id: string }>(
        "select id from public.organizations",
      );
      expect(orgs.map((row) => row.id)).toEqual([orgA]);
    } finally {
      await active.close();
    }

    const adminSession = await openSession({ userId: adminA });
    try {
      await adminSession.query(
        "update public.organization_members set active = false where organization_id = $1 and user_id = $2",
        [orgA, secretary],
      );
    } finally {
      await adminSession.close();
    }

    const revoked = await openSession({ userId: secretary });
    try {
      expect(await revoked.query("select id from public.organizations")).toEqual([]);
    } finally {
      await revoked.close();
    }
  });
});

describe("multi-membership", () => {
  it("resolve permissões por organização, nunca por posição na lista", async () => {
    const adminA = await createAuthUser();
    const adminB = await createAuthUser();
    const shared = await createAuthUser();

    const orgA = await bootstrapOrganization(adminA, "Multi A");
    const orgB = await bootstrapOrganization(adminB, "Multi B");

    // Admin em A, secretária em B.
    await addMember(adminA, orgA, shared, "psychologist_admin");
    await addMember(adminB, orgB, shared, "secretary");

    const session = await openSession({ userId: shared });
    try {
      const orgs = await session.query<{ id: string }>(
        "select id from public.organizations order by name",
      );
      expect(orgs.map((row) => row.id).sort()).toEqual([orgA, orgB].sort());

      const roles = await session.query<{ organization_id: string; role: string }>(
        "select organization_id, role from public.organization_members where user_id = $1",
        [shared],
      );
      expect(
        roles.reduce<Record<string, string>>((acc, row) => {
          acc[row.organization_id] = row.role;
          return acc;
        }, {}),
      ).toEqual({ [orgA]: "psychologist_admin", [orgB]: "secretary" });

      // Admin em A: enxerga settings e auditoria de A.
      const settingsA = await session.query(
        "select organization_id from public.practice_settings where organization_id = $1",
        [orgA],
      );
      expect(settingsA).toHaveLength(1);

      // Secretária em B: mesmo usuário, sem acesso administrativo em B.
      const settingsB = await session.query(
        "select organization_id from public.practice_settings where organization_id = $1",
        [orgB],
      );
      expect(settingsB).toEqual([]);

      const auditB = await session.query(
        "select id from public.audit_events where organization_id = $1",
        [orgB],
      );
      expect(auditB).toEqual([]);
    } finally {
      await session.close();
    }
  });
});
