import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  bootstrapOrganization,
  createAuthUser,
  openSession,
} from "./support/db";

describe("practice_tasks — checklist operacional do Meu Dia", () => {
  let admin: string;
  let secretary: string;
  let organizationId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    secretary = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Consultório Meu Dia");
    await addMember(admin, organizationId, secretary, "secretary");
  });

  it("admin e secretária têm CRUD nas tarefas da própria organização", async () => {
    for (const actor of [admin, secretary]) {
      const session = await openSession({ userId: actor });
      try {
        const inserted = await session.query<{
          id: string;
          created_by_user_id: string;
        }>(
          `insert into public.practice_tasks (organization_id, title)
           values ($1, $2) returning id, created_by_user_id`,
          [organizationId, `Tarefa de ${actor}`],
        );
        expect(inserted[0].created_by_user_id).toBe(actor);

        const completed = await session.query<{ completed_at: string }>(
          `update public.practice_tasks
           set completed_at = now()
           where id = $1
           returning completed_at`,
          [inserted[0].id],
        );
        expect(completed[0].completed_at).toBeTruthy();

        const deleted = await session.query(
          "delete from public.practice_tasks where id = $1 returning id",
          [inserted[0].id],
        );
        expect(deleted).toHaveLength(1);
      } finally {
        await session.close();
      }
    }
  });

  it("created_by_user_id é forçado para auth.uid() e não aceita forja do cliente", async () => {
    const outsider = await createAuthUser();
    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{ created_by_user_id: string }>(
        `insert into public.practice_tasks (organization_id, title, created_by_user_id)
         values ($1, 'Forjada', $2)
         returning created_by_user_id`,
        [organizationId, outsider],
      );
      expect(rows[0].created_by_user_id).toBe(admin);
    } finally {
      await session.close();
    }
  });

  it("membro de outra organização não lê nem escreve tarefas de A", async () => {
    const adminSession = await openSession({ userId: admin });
    let taskId = "";
    try {
      const rows = await adminSession.query<{ id: string }>(
        `insert into public.practice_tasks (organization_id, title)
         values ($1, 'Isolada') returning id`,
        [organizationId],
      );
      taskId = rows[0].id;
    } finally {
      await adminSession.close();
    }

    const outsider = await createAuthUser();
    await bootstrapOrganization(outsider, "Outro Consultório");
    const session = await openSession({ userId: outsider });
    try {
      const read = await session.query(
        "select id from public.practice_tasks where id = $1",
        [taskId],
      );
      expect(read).toEqual([]);

      const write = await session.query(
        `update public.practice_tasks set title = 'Hack' where id = $1 returning id`,
        [taskId],
      );
      expect(write).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("título vazio é rejeitado pelo check constraint", async () => {
    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        `insert into public.practice_tasks (organization_id, title)
         values ($1, '   ')`,
        [organizationId],
      );
      expect(error).toMatch(/check|violates/i);
    } finally {
      await session.close();
    }
  });
});

describe("organization_shell_settings — greeting_prefix e quote", () => {
  it("expõe greeting_prefix e quote sem vazar campos administrativos", async () => {
    const admin = await createAuthUser();
    const secretary = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Saudação");
    await addMember(admin, organizationId, secretary, "secretary");

    const adminSession = await openSession({ userId: admin });
    try {
      await adminSession.query(
        `update public.practice_settings
         set greeting_prefix = 'Bom dia', quote = 'Um passo de cada vez.', pix_key = 'segredo'
         where organization_id = $1`,
        [organizationId],
      );
    } finally {
      await adminSession.close();
    }

    const session = await openSession({ userId: secretary });
    try {
      const rows = await session.query<{
        greeting_prefix: string;
        quote: string;
      }>("select * from public.organization_shell_settings($1)", [organizationId]);
      expect(rows[0].greeting_prefix).toBe("Bom dia");
      expect(rows[0].quote).toBe("Um passo de cada vez.");
      expect(Object.keys(rows[0])).not.toContain("pix_key");
    } finally {
      await session.close();
    }
  });
});
