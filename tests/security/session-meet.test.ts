import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  bootstrapOrganization,
  createAuthUser,
  openSession,
} from "./support/db";

describe("Session-owned Google Meet — RLS and append-only transcript", () => {
  let admin: string;
  let otherAdmin: string;
  let psychologist: string;
  let organizationId: string;
  let adminSessionId: string;
  let secondAdminSessionId: string;
  let psychologistSessionId: string;

  beforeAll(async () => {
    admin = await createAuthUser("admin-session-meet@tesseli.test");
    otherAdmin = await createAuthUser("other-admin-session-meet@tesseli.test");
    psychologist = await createAuthUser("psychologist-session-meet@tesseli.test");
    organizationId = await bootstrapOrganization(admin, "Clínica Meet RLS");
    await addMember(admin, organizationId, otherAdmin, "psychologist_admin");
    await addMember(admin, organizationId, psychologist, "psychologist");

    const adminDb = await openSession({ userId: admin });
    try {
      const patients = await adminDb.query<{ id: string }>(
        `insert into public.patients (
           organization_id, preferred_name, full_name, responsible_psychologist_user_id
         ) values
           ($1, 'Paciente Meet 1', 'Paciente Meet 1', $2),
           ($1, 'Paciente Meet 2', 'Paciente Meet 2', $2)
         returning id`,
        [organizationId, admin],
      );
      const first = await adminDb.query<{ start_clinical_session: string }>(
        "select public.start_clinical_session($1, $2) as start_clinical_session",
        [organizationId, patients[0].id],
      );
      const second = await adminDb.query<{ start_clinical_session: string }>(
        "select public.start_clinical_session($1, $2) as start_clinical_session",
        [organizationId, patients[1].id],
      );
      adminSessionId = first[0].start_clinical_session;
      secondAdminSessionId = second[0].start_clinical_session;

      await adminDb.query(
        `insert into public.session_meet_bindings (
           session_id, organization_id, status, meet_space_name,
           meeting_code, meet_url, transcript_status
         ) values ($1, $2, 'ready', 'spaces/admin-session',
           'abc-defg-hij', 'https://meet.google.com/abc-defg-hij', 'awaiting_artifact')`,
        [adminSessionId, organizationId],
      );
      await adminDb.query(
        `insert into public.session_meet_transcript_entries (
           session_id, organization_id, conference_record_name, transcript_name,
           google_entry_name, text, start_time, end_time
         ) values ($1, $2, 'conferenceRecords/test',
           'conferenceRecords/test/transcripts/test',
           'conferenceRecords/test/transcripts/test/entries/1',
           'Fala de teste', now(), now())`,
        [adminSessionId, organizationId],
      );
    } finally {
      await adminDb.close();
    }

    const psychologistDb = await openSession({ userId: psychologist });
    try {
      const patients = await psychologistDb.query<{ id: string }>(
        `insert into public.patients (
           organization_id, preferred_name, full_name, responsible_psychologist_user_id
         ) values ($1, 'Paciente Psicóloga', 'Paciente Psicóloga', $2)
         returning id`,
        [organizationId, psychologist],
      );
      const sessions = await psychologistDb.query<{ start_clinical_session: string }>(
        "select public.start_clinical_session($1, $2) as start_clinical_session",
        [organizationId, patients[0].id],
      );
      psychologistSessionId = sessions[0].start_clinical_session;
    } finally {
      await psychologistDb.close();
    }
  });

  it("permite Meet somente à administradora responsável pela sessão", async () => {
    const owner = await openSession({ userId: admin });
    try {
      const rows = await owner.query<{ session_id: string }>(
        "select session_id from public.session_meet_bindings where session_id = $1",
        [adminSessionId],
      );
      expect(rows).toEqual([{ session_id: adminSessionId }]);
    } finally {
      await owner.close();
    }

    const colleague = await openSession({ userId: otherAdmin });
    try {
      const hidden = await colleague.query(
        "select session_id from public.session_meet_bindings where session_id = $1",
        [adminSessionId],
      );
      expect(hidden).toEqual([]);

      const denied = await colleague.expectError(
        `insert into public.session_meet_bindings (session_id, organization_id)
         values ($1, $2)`,
        [secondAdminSessionId, organizationId],
      );
      expect(denied).toMatch(/row-level security/i);
    } finally {
      await colleague.close();
    }

    const nonAdmin = await openSession({ userId: psychologist });
    try {
      const denied = await nonAdmin.expectError(
        `insert into public.session_meet_bindings (session_id, organization_id)
         values ($1, $2)`,
        [psychologistSessionId, organizationId],
      );
      expect(denied).toMatch(/row-level security/i);
    } finally {
      await nonAdmin.close();
    }
  });

  it("não concede acesso algum a anon e limita authenticated às operações previstas", async () => {
    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{
        anon_any: boolean;
        binding_select: boolean;
        binding_insert: boolean;
        binding_update: boolean;
        binding_delete: boolean;
        transcript_select: boolean;
        transcript_insert: boolean;
        transcript_update: boolean;
        transcript_delete: boolean;
        transcript_truncate: boolean;
      }>(
        `select
           (has_table_privilege('anon', 'public.session_meet_bindings', 'SELECT')
             or has_table_privilege('anon', 'public.session_meet_bindings', 'INSERT')
             or has_table_privilege('anon', 'public.session_meet_bindings', 'UPDATE')
             or has_table_privilege('anon', 'public.session_meet_bindings', 'DELETE')
             or has_table_privilege('anon', 'public.session_meet_bindings', 'TRUNCATE')
             or has_table_privilege('anon', 'public.session_meet_transcript_entries', 'SELECT')
             or has_table_privilege('anon', 'public.session_meet_transcript_entries', 'INSERT')
             or has_table_privilege('anon', 'public.session_meet_transcript_entries', 'UPDATE')
             or has_table_privilege('anon', 'public.session_meet_transcript_entries', 'DELETE')
             or has_table_privilege('anon', 'public.session_meet_transcript_entries', 'TRUNCATE')) as anon_any,
           has_table_privilege('authenticated', 'public.session_meet_bindings', 'SELECT') as binding_select,
           has_table_privilege('authenticated', 'public.session_meet_bindings', 'INSERT') as binding_insert,
           has_table_privilege('authenticated', 'public.session_meet_bindings', 'UPDATE') as binding_update,
           has_table_privilege('authenticated', 'public.session_meet_bindings', 'DELETE') as binding_delete,
           has_table_privilege('authenticated', 'public.session_meet_transcript_entries', 'SELECT') as transcript_select,
           has_table_privilege('authenticated', 'public.session_meet_transcript_entries', 'INSERT') as transcript_insert,
           has_table_privilege('authenticated', 'public.session_meet_transcript_entries', 'UPDATE') as transcript_update,
           has_table_privilege('authenticated', 'public.session_meet_transcript_entries', 'DELETE') as transcript_delete,
           has_table_privilege('authenticated', 'public.session_meet_transcript_entries', 'TRUNCATE') as transcript_truncate`,
      );

      expect(rows[0]).toEqual({
        anon_any: false,
        binding_select: true,
        binding_insert: true,
        binding_update: true,
        binding_delete: false,
        transcript_select: true,
        transcript_insert: true,
        transcript_update: false,
        transcript_delete: false,
        transcript_truncate: false,
      });
    } finally {
      await session.close();
    }
  });

  it("revoga execução direta das funções de trigger SECURITY DEFINER", async () => {
    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{
        anon_binding: boolean;
        authenticated_binding: boolean;
        anon_transcript: boolean;
        authenticated_transcript: boolean;
      }>(
        `select
           has_function_privilege('anon', 'public.assert_session_meet_binding_consistency()', 'EXECUTE') as anon_binding,
           has_function_privilege('authenticated', 'public.assert_session_meet_binding_consistency()', 'EXECUTE') as authenticated_binding,
           has_function_privilege('anon', 'public.assert_session_meet_transcript_entry_consistency()', 'EXECUTE') as anon_transcript,
           has_function_privilege('authenticated', 'public.assert_session_meet_transcript_entry_consistency()', 'EXECUTE') as authenticated_transcript`,
      );
      expect(rows[0]).toEqual({
        anon_binding: false,
        authenticated_binding: false,
        anon_transcript: false,
        authenticated_transcript: false,
      });
    } finally {
      await session.close();
    }
  });
});
