import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  bootstrapOrganization,
  createAuthUser,
  openSession,
  setSecretaryFinanceAccess,
} from "./support/db";

describe("isolamento por papel", () => {
  let admin: string;
  let secretary: string;
  let organizationId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    secretary = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Consultório Papéis");
    await addMember(admin, organizationId, secretary, "secretary");
  });

  it("secretária não lê practice_settings diretamente", async () => {
    const session = await openSession({ userId: secretary });
    try {
      const rows = await session.query(
        "select organization_id from public.practice_settings where organization_id = $1",
        [organizationId],
      );
      expect(rows).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("secretária não altera practice_settings", async () => {
    const session = await openSession({ userId: secretary });
    try {
      const updated = await session.query(
        "update public.practice_settings set secretary_finance_access = 'manage' where organization_id = $1 returning organization_id",
        [organizationId],
      );
      expect(updated).toEqual([]);
    } finally {
      await session.close();
    }

    const adminSession = await openSession({ userId: admin });
    try {
      const rows = await adminSession.query<{ secretary_finance_access: string }>(
        "select secretary_finance_access from public.practice_settings where organization_id = $1",
        [organizationId],
      );
      expect(rows[0].secretary_finance_access).toBe("none");
    } finally {
      await adminSession.close();
    }
  });

  it("secretária recebe apenas a projeção mínima de settings do shell", async () => {
    const session = await openSession({ userId: secretary });
    try {
      const rows = await session.query<Record<string, unknown>>(
        "select * from public.organization_shell_settings($1)",
        [organizationId],
      );
      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0]).sort()).toEqual(
        [
          "clinic_name",
          "greeting_prefix",
          "inactivity_timeout_minutes",
          "organization_id",
          "organization_name",
          "professional_name",
          "quote",
          "session_duration_minutes",
          "timezone",
        ].sort(),
      );
      // Nenhum campo administrativo/financeiro na projeção.
      expect(Object.keys(rows[0])).not.toContain("secretary_finance_access");
      expect(Object.keys(rows[0])).not.toContain("pix_key");
      expect(Object.keys(rows[0])).not.toContain("tax_id");
    } finally {
      await session.close();
    }
  });

  it("projeção mínima nega organização de outro tenant", async () => {
    const otherAdmin = await createAuthUser();
    const otherOrg = await bootstrapOrganization(otherAdmin, "Outra");

    const session = await openSession({ userId: secretary });
    try {
      const rows = await session.query(
        "select * from public.organization_shell_settings($1)",
        [otherOrg],
      );
      expect(rows).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("secretária não enumera a equipe nem gerencia membros", async () => {
    const session = await openSession({ userId: secretary });
    try {
      const members = await session.query<{ user_id: string }>(
        "select user_id from public.organization_members where organization_id = $1",
        [organizationId],
      );
      expect(members.map((row) => row.user_id)).toEqual([secretary]);

      const stranger = await createAuthUser();
      const insertError = await session.expectError(
        "insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'secretary')",
        [organizationId, stranger],
      );
      expect(insertError).toMatch(/violates row-level security/i);

      const selfPromotion = await session.query(
        "update public.organization_members set role = 'psychologist_admin' where organization_id = $1 and user_id = $2 returning id",
        [organizationId, secretary],
      );
      expect(selfPromotion).toEqual([]);

      const deletion = await session.query(
        "delete from public.organization_members where organization_id = $1 and user_id = $2 returning id",
        [organizationId, secretary],
      );
      expect(deletion).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("secretária não lê a trilha de auditoria", async () => {
    const session = await openSession({ userId: secretary });
    try {
      const rows = await session.query(
        "select id from public.audit_events where organization_id = $1",
        [organizationId],
      );
      expect(rows).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("admin gerencia organização, equipe, settings e auditoria", async () => {
    const session = await openSession({ userId: admin });
    try {
      const renamed = await session.query<{ name: string }>(
        "update public.organizations set name = 'Consultório Renomeado' where id = $1 returning name",
        [organizationId],
      );
      expect(renamed[0].name).toBe("Consultório Renomeado");

      const settings = await session.query<{ inactivity_timeout_minutes: number }>(
        "update public.practice_settings set inactivity_timeout_minutes = 10 where organization_id = $1 returning inactivity_timeout_minutes",
        [organizationId],
      );
      expect(settings[0].inactivity_timeout_minutes).toBe(10);

      const audit = await session.query<{ action: string }>(
        "select action from public.audit_events where organization_id = $1",
        [organizationId],
      );
      expect(audit.map((row) => row.action)).toContain("organization.bootstrap");
    } finally {
      await session.close();
    }
  });
});

describe("secretary_finance_access", () => {
  it("é resolvido pelo banco nos três estados e nunca pela UI", async () => {
    const admin = await createAuthUser();
    const secretary = await createAuthUser();
    const outsider = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Financeiro");
    await addMember(admin, organizationId, secretary, "secretary");

    for (const value of ["none", "view", "manage"] as const) {
      await setSecretaryFinanceAccess(admin, organizationId, value);

      const session = await openSession({ userId: secretary });
      try {
        const rows = await session.query<{ access: string }>(
          "select public.secretary_finance_access($1) as access",
          [organizationId],
        );
        expect(rows[0].access).toBe(value);
      } finally {
        await session.close();
      }
    }

    // Admin não é limitado pelo setting da secretaria.
    await setSecretaryFinanceAccess(admin, organizationId, "none");
    const adminSession = await openSession({ userId: admin });
    try {
      const rows = await adminSession.query<{ access: string }>(
        "select public.secretary_finance_access($1) as access",
        [organizationId],
      );
      expect(rows[0].access).toBe("manage");
    } finally {
      await adminSession.close();
    }

    // Quem não é membro não recebe permissão alguma.
    const outsiderSession = await openSession({ userId: outsider });
    try {
      const rows = await outsiderSession.query<{ access: string | null }>(
        "select public.secretary_finance_access($1) as access",
        [organizationId],
      );
      expect(rows[0].access).toBeNull();
    } finally {
      await outsiderSession.close();
    }
  });
});
