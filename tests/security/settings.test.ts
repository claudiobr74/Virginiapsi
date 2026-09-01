import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  bootstrapOrganization,
  createAuthUser,
  openSession,
} from "./support/db";

describe("settings — exports, equipe, retenção e eliminação", () => {
  let admin: string;
  let secretary: string;
  let outsider: string;
  let organizationId: string;
  let patientId: string;

  beforeAll(async () => {
    admin = await createAuthUser("admin-settings@tesseli.test");
    secretary = await createAuthUser("sec-settings@tesseli.test");
    outsider = await createAuthUser("out-settings@tesseli.test");
    organizationId = await bootstrapOrganization(admin, "Consultório Settings");
    await bootstrapOrganization(outsider, "Outro Consultório");
    await addMember(admin, organizationId, secretary, "secretary");

    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{ id: string }>(
        `insert into public.patients (organization_id, preferred_name, full_name, birth_date, email, phone)
         values ($1, 'Settings Um', 'Settings Um Paciente', '1990-01-01', 'settings.um@example.com', '11911112222')
         returning id`,
        [organizationId],
      );
      patientId = rows[0].id;
    } finally {
      await session.close();
    }
  });

  it("a migration não grava valores de Vault", () => {
    const sql = readFileSync(
      path.resolve(__dirname, "../../supabase/migrations/20260820230000_settings_backup.sql"),
      "utf8",
    );
    expect(sql).toMatch(/tesseli_app_url/);
    expect(sql).toMatch(/tesseli_cron_secret/);
    expect(sql).not.toMatch(/insert\s+into\s+vault/i);
    expect(sql).not.toMatch(/CRON_SECRET\s*=/);
  });

  it("secretária não lê logical_exports nem lista a equipe", async () => {
    const session = await openSession({ userId: secretary });
    try {
      const exports = await session.query(
        "select id from public.logical_exports where organization_id = $1",
        [organizationId],
      );
      expect(exports).toEqual([]);

      const error = await session.expectError(
        "select * from public.list_organization_members($1)",
        [organizationId],
      );
      expect(error).toMatch(/not authorized/i);
    } finally {
      await session.close();
    }
  });

  it("secretária não altera elimination_status", async () => {
    const session = await openSession({ userId: secretary });
    try {
      const error = await session.expectError(
        `update public.patients set elimination_status = 'elimination_requested' where id = $1 returning id`,
        [patientId],
      );
      expect(error).toMatch(/only psychologist_admin may change elimination_status/i);
    } finally {
      await session.close();
    }
  });

  it("secretária e autenticado não executam purge nem expire", async () => {
    const session = await openSession({ userId: secretary });
    try {
      const purge = await session.expectError("select public.purge_expired_fallback_audio()");
      expect(purge).toMatch(/not authorized|permission denied/i);
      const expire = await session.expectError("select public.expire_stale_logical_exports()");
      expect(expire).toMatch(/not authorized|permission denied/i);
    } finally {
      await session.close();
    }
  });

  it("tenant errado não lê exportações", async () => {
    const session = await openSession({ userId: outsider });
    try {
      const rows = await session.query(
        "select id from public.logical_exports where organization_id = $1",
        [organizationId],
      );
      expect(rows).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("admin cria exportação e secretária continua sem vê-la", async () => {
    const adminSession = await openSession({ userId: admin });
    try {
      const rows = await adminSession.query<{ id: string }>(
        `insert into public.logical_exports (organization_id, actor_user_id, scope, status)
         values ($1, $2, 'organization', 'queued') returning id`,
        [organizationId, admin],
      );
      expect(rows).toHaveLength(1);
    } finally {
      await adminSession.close();
    }

    const secretarySession = await openSession({ userId: secretary });
    try {
      const hidden = await secretarySession.query(
        "select id from public.logical_exports where organization_id = $1",
        [organizationId],
      );
      expect(hidden).toEqual([]);
    } finally {
      await secretarySession.close();
    }
  });

  it("admin lista equipe e convida usuário já cadastrado", async () => {
    const session = await openSession({ userId: admin });
    try {
      const members = await session.query<{ email: string; role: string }>(
        "select email, role from public.list_organization_members($1)",
        [organizationId],
      );
      expect(members.some((row) => row.role === "secretary")).toBe(true);

      const invitee = await createAuthUser("convite-settings@tesseli.test");
      void invitee;
      const id = await session.query<{ invite_organization_member: string }>(
        "select public.invite_organization_member($1, $2, 'secretary') as invite_organization_member",
        [organizationId, "convite-settings@tesseli.test"],
      );
      expect(id[0].invite_organization_member).toMatch(
        /^[0-9a-f-]{36}$/i,
      );
    } finally {
      await session.close();
    }
  });

  it("retenção elimina áudio fora da janela e preserva o recente", async () => {
    const { Client } = await import("pg");
    const { ADMIN_URL } = await import("./support/db");
    const oldPath = `${organizationId}/${randomUUID()}/old.webm`;
    const newPath = `${organizationId}/${randomUUID()}/new.webm`;
    const adminDb = new Client({ connectionString: ADMIN_URL });
    await adminDb.connect();
    try {
      await adminDb.query(
        `insert into storage.objects (bucket_id, name, created_at)
         values
           ('session-audio-fallback', $1, now() - interval '30 days'),
           ('session-audio-fallback', $2, now() - interval '1 day')`,
        [oldPath, newPath],
      );
    } finally {
      await adminDb.end();
    }

    const service = await openSession({ role: "service_role" });
    try {
      const purged = await service.query<{ purge_expired_fallback_audio: number }>(
        "select public.purge_expired_fallback_audio()",
      );
      expect(purged[0].purge_expired_fallback_audio).toBeGreaterThanOrEqual(1);
    } finally {
      await service.close();
    }

    const reader = new Client({ connectionString: ADMIN_URL });
    await reader.connect();
    try {
      const remaining = await reader.query<{ name: string }>(
        `select name from storage.objects
         where bucket_id = 'session-audio-fallback' and name in ($1, $2)
         order by name`,
        [oldPath, newPath],
      );
      expect(remaining.rows.map((row) => row.name)).toEqual([newPath]);
    } finally {
      await reader.end();
    }
  });

  it("anon é rejeitado nas tabelas de exportação", async () => {
    const session = await openSession();
    try {
      const error = await session.expectError("select id from public.logical_exports");
      expect(error).toMatch(/permission denied|not authorized/i);
    } finally {
      await session.close();
    }
  });

  it("admin conclui eliminação parcial e registra motivo de retenção", async () => {
    const session = await openSession({ userId: admin });
    try {
      await session.query(
        `insert into public.consents (organization_id, patient_id, type, title, version, status)
         values ($1, $2, 'whatsapp', 'WhatsApp', 'minimo-2026-08', 'accepted')`,
        [organizationId, patientId],
      );
      await session.query(
        `update public.patients
            set preferred_name = 'Eliminado PAC-TEST',
                full_name = 'Paciente eliminado',
                email = null,
                phone = null,
                elimination_status = 'partially_eliminated',
                elimination_retained_reason = 'guarda mínima'
          where id = $1`,
        [patientId],
      );
      const rows = await session.query<{
        elimination_status: string;
        email: string | null;
      }>(
        "select elimination_status, email from public.patients where id = $1",
        [patientId],
      );
      expect(rows[0].elimination_status).toBe("partially_eliminated");
      expect(rows[0].email).toBeNull();
    } finally {
      await session.close();
    }
  });

  it("invoke_audio_retention_job posta no endpoint com o header de cron", async () => {
    const { Client } = await import("pg");
    const { ADMIN_URL } = await import("./support/db");
    const client = new Client({ connectionString: ADMIN_URL });
    await client.connect();
    try {
      await client.query(
        "delete from vault.secrets where name in ('tesseli_app_url', 'tesseli_cron_secret')",
      );
      await client.query("delete from net.http_request_queue");
      await client.query(
        `insert into vault.secrets (name, secret) values ('tesseli_app_url', 'http://127.0.0.1:3999'), ('tesseli_cron_secret', 'cron-from-vault')
         on conflict (name) do update set secret = excluded.secret`,
      );
      await client.query("select public.invoke_audio_retention_job()");
      const queued = await client.query<{ url: string; headers: Record<string, string> }>(
        "select url, headers from net.http_request_queue order by id desc limit 1",
      );
      expect(queued.rows[0].url).toMatch(/\/api\/jobs\/audio-retention$/);
      expect(queued.rows[0].headers["x-cron-secret"]).toBe("cron-from-vault");
    } finally {
      await client.query(
        "delete from vault.secrets where name in ('tesseli_app_url', 'tesseli_cron_secret')",
      );
      await client.query("delete from net.http_request_queue");
      await client.end();
    }
  });

  it("outro tenant não recebe convite cruzado", async () => {
    const session = await openSession({ userId: outsider });
    try {
      const error = await session.expectError(
        "select public.invite_organization_member($1, $2, 'secretary')",
        [organizationId, "sec-settings@tesseli.test"],
      );
      expect(error).toMatch(/not authorized/i);
    } finally {
      await session.close();
    }
  });

  it("admin grava photo_path do próprio tenant; CHECK bloqueia outro org; secretária não atualiza", async () => {
    const validPath = `${organizationId}/professional/c0ffee00-portrait.jpg`;
    const adminSession = await openSession({ userId: admin });
    try {
      const updated = await adminSession.query<{ photo_path: string }>(
        `update public.practice_settings
         set photo_path = $2
         where organization_id = $1
         returning photo_path`,
        [organizationId, validPath],
      );
      expect(updated[0].photo_path).toBe(validPath);

      const checkError = await adminSession.expectError(
        `update public.practice_settings
         set photo_path = $2
         where organization_id = $1`,
        [organizationId, "33333333-3333-4333-8333-333333333333/professional/evil.jpg"],
      );
      expect(checkError).toMatch(/photo_path_tenant_prefix|check constraint/i);
    } finally {
      await adminSession.close();
    }

    const secretarySession = await openSession({ userId: secretary });
    try {
      const updatedBySecretary = await secretarySession.query(
        `update public.practice_settings set photo_path = $2 where organization_id = $1 returning photo_path`,
        [organizationId, `${organizationId}/professional/secretary.jpg`],
      );
      expect(updatedBySecretary).toEqual([]);

      const shell = await secretarySession.query<{ photo_path: string | null }>(
        "select photo_path from public.organization_shell_settings($1)",
        [organizationId],
      );
      expect(shell[0].photo_path).toBe(validPath);
    } finally {
      await secretarySession.close();
    }
  });

  it("bucket practice-assets existe, é privado, e storage.objects não tem policy aberta", async () => {
    const session = await openSession({ userId: admin });
    try {
      const buckets = await session.query<{ id: string; public: boolean }>(
        "select id, public from storage.buckets where id = 'practice-assets'",
      );
      expect(buckets).toHaveLength(1);
      expect(buckets[0].public).toBe(false);
      const insertError = await session.expectError(
        `insert into storage.objects (bucket_id, name, owner)
         values ('practice-assets', $1, $2)`,
        [`${organizationId}/professional/secret.jpg`, admin],
      );
      expect(insertError).toMatch(/row-level security/i);
      const selectRows = await session.query(
        `select id from storage.objects where bucket_id = 'practice-assets'`,
      );
      expect(selectRows).toEqual([]);
    } finally {
      await session.close();
    }
  });

});
