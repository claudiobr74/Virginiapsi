// Minimal Supabase stub (Auth REST + the handful of Data API endpoints the
// shell uses) for deterministic Playwright E2E coverage in an environment
// without Docker or a live Supabase project.
//
// It is never used by application code and proves nothing about RLS/JWT
// security: the real policies are exercised against PostgreSQL in
// `pnpm test:security`, and the final verification against a live Supabase
// project remains pending.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.AUTH_STUB_PORT ?? 54331);

function makeUser(email, fullName) {
  return {
    id: randomUUID(),
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
    phone: "",
    confirmed_at: "2026-01-01T00:00:00.000Z",
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: fullName },
    identities: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

const PASSWORD = "Tesseli#2026";

// Seeded accounts, one per tenancy scenario the E2E suite needs.
const ADMIN = makeUser("psicologa@tesseli.test", "Ana Serena");
const NEWCOMER = makeUser("nova@tesseli.test", "Nova Profissional");
const MULTI = makeUser("multi@tesseli.test", "Marina Multi");
const SECRETARY = makeUser("secretaria@tesseli.test", "Sara Secretaria");

const usersByEmail = new Map(
  [ADMIN, NEWCOMER, MULTI, SECRETARY].map((user) => [user.email, user]),
);

/** @type {Map<string, typeof ADMIN>} */
const tokensToUser = new Map();

/** organizationId -> organization row */
const organizations = new Map();
/** userId -> membership rows */
const memberships = new Map();
/** organizationId -> practice_settings row */
const practiceSettingsByOrg = new Map();

function defaultPracticeSettings(organizationId, extras = {}) {
  return {
    organization_id: organizationId,
    professional_name: extras.professional_name ?? "Ana Serena",
    subtitle: extras.subtitle ?? "Psicóloga clínica",
    crp: extras.crp ?? null,
    tax_id: extras.tax_id ?? null,
    pix_key: extras.pix_key ?? null,
    clinic_name: extras.clinic_name ?? extras.name ?? "Consultório",
    company_name: extras.company_name ?? null,
    greeting_prefix: extras.greeting_prefix ?? "Olá",
    quote: extras.quote ?? null,
    session_duration_minutes: extras.session_duration_minutes ?? 50,
    monthly_goal: extras.monthly_goal ?? null,
    photo_path: null,
    signature_path: null,
    inactivity_timeout_minutes: extras.inactivity_timeout_minutes ?? 15,
    secretary_finance_access: extras.secretary_finance_access ?? "none",
    session_audio_fallback_retention_days:
      extras.session_audio_fallback_retention_days ?? 7,
    transcript_retention_policy: extras.transcript_retention_policy ?? "with_clinical_record",
    transcript_retention_fixed_days: extras.transcript_retention_fixed_days ?? null,
    clinical_record_minimum_retention_years:
      extras.clinical_record_minimum_retention_years ?? 5,
    reminder_lead_hours_24: 24,
    reminder_lead_hours_2: 2,
  };
}

function addMembership(userId, organizationId, role) {
  const list = memberships.get(userId) ?? [];
  const row = {
    id: randomUUID(),
    organization_id: organizationId,
    user_id: userId,
    role,
    active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  };
  list.push(row);
  memberships.set(userId, list);
  return row;
}

function emailForUserId(userId) {
  for (const user of usersByEmail.values()) {
    if (user.id === userId) return user.email;
  }
  return null;
}

function membershipsForOrg(organizationId) {
  const rows = [];
  for (const [userId, list] of memberships.entries()) {
    for (const row of list) {
      if (row.organization_id === organizationId) {
        rows.push({
          ...row,
          user_id: row.user_id ?? userId,
          email: emailForUserId(row.user_id ?? userId),
        });
      }
    }
  }
  return rows;
}

function seedOrganization({ name, slug, userId, role }) {
  const id = randomUUID();
  organizations.set(id, {
    id,
    name,
    slug,
    timezone: "America/Sao_Paulo",
    status: "active",
    professional_name: "Ana Serena",
    clinic_name: name,
    inactivity_timeout_minutes: 15,
    session_duration_minutes: 50,
  });
  addMembership(userId, id, role);
  practiceSettingsByOrg.set(id, defaultPracticeSettings(id, { clinic_name: name }));
  return id;
}

const ADMIN_ORG_ID = seedOrganization({
  name: "Consultório Serena",
  slug: "consultorio-serena",
  userId: ADMIN.id,
  role: "psychologist_admin",
});
seedOrganization({
  name: "Clínica Aurora",
  slug: "clinica-aurora",
  userId: MULTI.id,
  role: "psychologist_admin",
});
seedOrganization({
  name: "Espaço Bem-Viver",
  slug: "espaco-bem-viver",
  userId: MULTI.id,
  role: "secretary",
});
addMembership(SECRETARY.id, ADMIN_ORG_ID, "secretary");

const TEAM_INVITE = makeUser("equipe@tesseli.test", "Equipe Convite");
usersByEmail.set(TEAM_INVITE.email, TEAM_INVITE);

// ------------------------------------------------------------- Patients ---
/** organizationId -> Map<patientId, patientRow> */
const patientsByOrg = new Map();
/** organizationId -> last assigned public_code sequence */
const patientCodeCounters = new Map();
/** patientId -> clinical profile row */
const clinicalProfiles = new Map();

function nextPublicCode(organizationId) {
  const next = (patientCodeCounters.get(organizationId) ?? 0) + 1;
  patientCodeCounters.set(organizationId, next);
  return `PAC-${String(next).padStart(3, "0")}`;
}

function firstClinicalUser(organizationId) {
  const member = membershipsForOrg(organizationId).find(
    (row) =>
      row.active !== false &&
      (row.role === "psychologist_admin" || row.role === "psychologist"),
  );
  return member?.user_id ?? null;
}

function isClinicalRole(role) {
  return role === "psychologist_admin" || role === "psychologist";
}

const platformOperators = new Set([ADMIN.id, MULTI.id]);
const pendingInvitations = [];

function seedPatient(organizationId, overrides) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const patient = {
    id,
    organization_id: organizationId,
    public_code: nextPublicCode(organizationId),
    preferred_name: "Paciente",
    full_name: "Paciente Completo",
    birth_date: null,
    cpf: null,
    phone: null,
    email: null,
    responsibles: [],
    modality: "in_person",
    status: "active",
    default_session_value: null,
    responsible_psychologist_user_id:
      overrides.responsible_psychologist_user_id ?? firstClinicalUser(organizationId),
    elimination_status: "active",
    elimination_requested_at: null,
    elimination_completed_at: null,
    elimination_retained_reason: null,
    photo_path: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  const org = patientsByOrg.get(organizationId) ?? new Map();
  org.set(id, patient);
  patientsByOrg.set(organizationId, org);
  return patient;
}

seedPatient(ADMIN_ORG_ID, {
  preferred_name: "Beatriz",
  full_name: "Beatriz Lima",
  // Adult birth date: the Phase 5.5 consent gate fails closed without one.
  birth_date: "1990-05-10",
  phone: "11988887777",
  email: "beatriz@example.com",
});

// Dedicated patients for the consent E2E: each test mutates consent state, so
// they must not share a patient with each other or with the agenda specs.
for (const name of ["Consentimento Um", "Consentimento Dois", "Consentimento Tres"]) {
  seedPatient(ADMIN_ORG_ID, {
    preferred_name: name,
    full_name: `${name} Paciente`,
    birth_date: "1988-03-15",
  });
}

// Dedicated patients for the Fase 6 clinical-session E2E: each test starts
// (and possibly finalizes/cancels) its own session, so they must not share a
// patient with each other or with any other spec.
for (const name of ["Sessão Um", "Sessão Dois", "Sessão Tres", "Sessão Quatro"]) {
  seedPatient(ADMIN_ORG_ID, {
    preferred_name: name,
    full_name: `${name} Paciente`,
    birth_date: "1985-01-01",
  });
}

seedPatient(ADMIN_ORG_ID, {
  preferred_name: "Meu Dia Sessão",
  full_name: "Meu Dia Sessão Paciente",
  birth_date: "1987-07-07",
});

// Dedicated patients for the Fase 9 Documents/Attachments/TCLE E2E.
for (const name of [
  "Documentos Um",
  "Documentos Dois",
  "Documentos Tres",
  "Documentos Quatro",
  "TCLE Um",
]) {
  seedPatient(ADMIN_ORG_ID, {
    preferred_name: name,
    full_name: `${name} Paciente`,
    birth_date: "1988-06-15",
  });
}

for (const name of ["Financeiro Um", "Financeiro Dois", "Financeiro Sessão", "Financeiro Sessão Mobile"]) {
  seedPatient(ADMIN_ORG_ID, {
    preferred_name: name,
    full_name: `${name} Paciente`,
    birth_date: "1991-04-04",
    default_session_value: "150.00",
  });
}

seedPatient(ADMIN_ORG_ID, {
  preferred_name: "Canal Um",
  full_name: "Canal Um Paciente",
  birth_date: "1992-02-02",
  phone: "11977776666",
});
seedPatient(ADMIN_ORG_ID, {
  preferred_name: "Canal Dois",
  full_name: "Canal Dois Paciente",
  birth_date: "1993-03-03",
  phone: "11966665555",
});

for (const name of ["Configurações Um", "Configurações Dois"]) {
  seedPatient(ADMIN_ORG_ID, {
    preferred_name: name,
    full_name: `${name} Paciente`,
    birth_date: "1989-09-09",
    email: `${name.toLowerCase().replace(" ", ".")}@example.com`,
    phone: "11955554444",
  });
}

// Dedicated patients for the Fase 7 Supervisor E2E.
for (const name of ["Supervisor Um", "Supervisor Dois", "Supervisor Tres"]) {
  seedPatient(ADMIN_ORG_ID, {
    preferred_name: name,
    full_name: `${name} Paciente`,
    birth_date: "1982-01-01",
  });
}
clinicalProfiles.set(
  [...patientsByOrg.get(ADMIN_ORG_ID).values()][0].id,
  {
    patient_id: [...patientsByOrg.get(ADMIN_ORG_ID).values()][0].id,
    organization_id: ADMIN_ORG_ID,
    chief_complaint: "Ansiedade relacionada ao trabalho",
    history: null,
    therapy_goals: null,
    schemas: null,
    core_beliefs: null,
    general_clinical_notes: null,
  },
);

// ---------------------------------------------------------------- Agenda ---
/** organizationId -> Map<appointmentId, appointmentRow> */
const appointmentsByOrg = new Map();
/** organizationId -> connection row */
const connectionsByOrg = new Map();
/** organizationId -> Map<taskId, taskRow> */
const practiceTasksByOrg = new Map();
/** organizationId -> Map<consentId, consentRow> */
const consentsByOrg = new Map();
/** patientId -> preference row */
const communicationPreferences = new Map();
/** organizationId -> Map<templateKey, templateRow> */
const whatsappTemplatesByOrg = new Map();
/** organizationId -> Map<id, messageRow> */
const whatsappMessagesByOrg = new Map();
/** organizationId -> Map<id, inboundRow> */
const whatsappInboundByOrg = new Map();
/** organizationId -> Map<id, outboxRow> */
const whatsappOutboxByOrg = new Map();

const DEFAULT_WHATSAPP_TEMPLATES = {
  confirmation:
    "Olá, {{patient_name}}! Confirmamos sua sessão em {{starts_at}}. Qualquer imprevisto, responda esta mensagem.",
  reminder_24h:
    "Olá, {{patient_name}}! Lembrete: sua sessão é amanhã, {{starts_at}}. Responda SIM para confirmar.",
  reminder_2h:
    "Olá, {{patient_name}}! Sua sessão começa em cerca de 2 horas ({{starts_at}}). Até breve.",
  welcome:
    "Olá, {{patient_name}}! Este é o canal administrativo do consultório. Avisos de sessão e confirmações chegam por aqui.",
  billing:
    "Olá, {{patient_name}}! Segue o lembrete administrativo referente ao valor combinado da sessão. Qualquer dúvida, fale conosco.",
};

function ensureWhatsappTemplates(organizationId) {
  const table = getOrCreateOrgMap(whatsappTemplatesByOrg, organizationId);
  for (const [template_key, body] of Object.entries(DEFAULT_WHATSAPP_TEMPLATES)) {
    if (![...table.values()].some((row) => row.template_key === template_key)) {
      const row = {
        id: randomUUID(),
        organization_id: organizationId,
        template_key,
        body,
        twilio_content_sid: null,
      };
      table.set(row.id, row);
    }
  }
}

function patientWhatsappAllowed(organizationId, patientId) {
  const pref = communicationPreferences.get(patientId);
  if (!pref?.whatsapp_enabled || pref.organization_id !== organizationId) {
    return false;
  }
  const consents = [...(consentsByOrg.get(organizationId)?.values() ?? [])];
  return consents.some(
    (row) => row.patient_id === patientId && row.type === "whatsapp" && row.status === "accepted",
  );
}

const ADMINISTRATIVE_CONSENT_TYPES = new Set(["service_terms", "whatsapp"]);

// ---------------------------------------------------------- Fase 6: sessão ---
/** organizationId -> Map<sessionId, clinicalSessionRow> */
const clinicalSessionsByOrg = new Map();
/** organizationId -> Map<sessionId, dpepRow> (1:1 with the session) */
const sessionDpepByOrg = new Map();
/** organizationId -> Map<sessionId, workingNotesRow> (1:1 with the session) */
const sessionWorkingNotesByOrg = new Map();
/** organizationId -> Map<segmentId, segmentRow> */
const transcriptSegmentsByOrg = new Map();
/** organizationId -> Map<runId, aiRunRow> */
const aiRunsByOrg = new Map();
/** organizationId -> Map<artifactId, aiArtifactRow> */
const aiArtifactsByOrg = new Map();
/** organizationId -> Map<collectionId, row> */
const knowledgeCollectionsByOrg = new Map();
/** organizationId -> Map<sourceId, row> */
const knowledgeSourcesByOrg = new Map();
/** organizationId -> Map<documentId, row> (keyed by source_id too, 1:1) */
const knowledgeDocumentsByOrg = new Map();
/** organizationId -> Map<chunkId, row> */
const knowledgeChunksByOrg = new Map();
/** organizationId -> Map<templateId, row> */
const documentTemplatesByOrg = new Map();
/** organizationId -> Map<documentId, row> */
const documentsByOrg = new Map();
/** organizationId -> Map<versionId, row> */
const documentVersionsByOrg = new Map();
/** organizationId -> Map<fileId, row> */
const documentFilesByOrg = new Map();
const documentBrandingByOrg = new Map();
const documentLogosByOrg = new Map();
const documentFavoritesByOrg = new Map();
const documentDeliveryByOrg = new Map();
/** organizationId -> Map<attachmentId, row> */
const patientAttachmentsByOrg = new Map();
/** organizationId -> Map<fileId, row> */
const consentFilesByOrg = new Map();
/** organizationId -> Map<chargeId, row> */
const financialChargesByOrg = new Map();
/** organizationId -> Map<paymentId, row> */
const financialPaymentsByOrg = new Map();
/** organizationId -> Map<expenseId, row> */
const financialExpensesByOrg = new Map();
/** organizationId -> Map<planId, row> */
const financialPlansByOrg = new Map();
/** organizationId -> Map<movementId, row> */
const financialPlanMovementsByOrg = new Map();
/** organizationId -> Map<closingId, row> */
const financialClosingsByOrg = new Map();
/** organizationId -> Map<exportId, row> */
const logicalExportsByOrg = new Map();

const FORCED_CLINICAL_KINDS = new Set(["laudo", "relatorio", "atestado", "encaminhamento", "parecer"]);
const FORCED_ADMINISTRATIVE_KINDS = new Set(["recibo", "autorizacao", "requerimento", "protocolo"]);

function isSensitivityVisible(role, sensitivity) {
  return isClinicalRole(role) || sensitivity === "administrative";
}

/**
 * Mirrors every clinical_sessions/session_dpep/session_clinical_working_notes
 * RLS policy in this stub: psychologist_admin only, any organization the
 * caller actually belongs to as admin (queries in this feature filter by
 * row id alone and rely on RLS — see src/features/sessions/queries.ts).
 */
function findAdminScopedRow(byOrgMap, userId, predicate) {
  for (const [orgId, table] of byOrgMap.entries()) {
    if (membershipRole(userId, orgId) !== "psychologist_admin") continue;
    for (const row of table.values()) {
      if (predicate(row)) return row;
    }
  }
  return null;
}

function membershipRole(userId, organizationId) {
  return (
    (memberships.get(userId) ?? []).find(
      (row) => row.active && row.organization_id === organizationId,
    )?.role ?? null
  );
}

function getOrCreateOrgMap(map, organizationId) {
  const existing = map.get(organizationId);
  if (existing) return existing;
  const created = new Map();
  map.set(organizationId, created);
  return created;
}

function financeAccess(userId, organizationId) {
  const role = membershipRole(userId, organizationId);
  if (!role) return "none";
  if (role === "psychologist_admin") return "manage";
  if (role === "psychologist") return "none";
  return practiceSettingsByOrg.get(organizationId)?.secretary_finance_access ?? "none";
}

function canReadFinance(userId, organizationId) {
  return financeAccess(userId, organizationId) === "view" || financeAccess(userId, organizationId) === "manage";
}

function canWriteFinance(userId, organizationId) {
  return financeAccess(userId, organizationId) === "manage";
}

function findFinanceRow(byOrgMap, userId, predicate) {
  for (const [orgId, table] of byOrgMap.entries()) {
    if (!canReadFinance(userId, orgId)) continue;
    for (const row of table.values()) {
      if (predicate(row)) return row;
    }
  }
  return null;
}

function listFinanceRows(byOrgMap, userId, organizationId) {
  if (organizationId) {
    if (!canReadFinance(userId, organizationId)) return [];
    return [...(byOrgMap.get(organizationId)?.values() ?? [])];
  }
  const rows = [];
  for (const [orgId, table] of byOrgMap.entries()) {
    if (!canReadFinance(userId, orgId)) continue;
    rows.push(...table.values());
  }
  return rows;
}

function periodClosed(organizationId, competence) {
  if (!competence) return false;
  for (const closing of financialClosingsByOrg.get(organizationId)?.values() ?? []) {
    if (closing.status === "closed" && competence >= closing.period_start && competence <= closing.period_end) {
      return true;
    }
  }
  return false;
}

function refreshChargeStatus(charge) {
  if (charge.status === "canceled" || charge.status === "refunded") return;
  let paid = 0;
  for (const payment of financialPaymentsByOrg.get(charge.organization_id)?.values() ?? []) {
    if (payment.charge_id === charge.id && !payment.voided_at) {
      paid += Number(payment.amount);
    }
  }
  const amount = Number(charge.amount);
  const today = todaySaoPauloDateStr();
  if (paid >= amount && amount > 0) charge.status = "paid";
  else if (paid > 0) charge.status = "partially_paid";
  else if (charge.due_date && charge.due_date < today) charge.status = "overdue";
  else charge.status = "pending";
}

function seedAppointment(organizationId, overrides) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const appointment = {
    id,
    organization_id: organizationId,
    patient_id: null,
    starts_at: now,
    ends_at: now,
    status: "scheduled",
    modality: "in_person",
    origin: "TESSELI",
    managed_by_tesseli: true,
    google_calendar_id: null,
    google_event_id: null,
    meet_url: null,
    meet_status: "none",
    summary_snapshot: null,
    sync_status: "synced",
    create_idempotency_key: randomUUID(),
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  getOrCreateOrgMap(appointmentsByOrg, organizationId).set(id, appointment);
  return appointment;
}

function getConnection(organizationId) {
  return (
    connectionsByOrg.get(organizationId) ?? {
      organization_id: organizationId,
      status: "disconnected",
      google_account_email: null,
      calendar_id: null,
      calendar_summary: null,
      scopes: [],
      last_synced_at: null,
      last_sync_error: null,
    }
  );
}

// Seed: one appointment today at 09:00 America/Sao_Paulo (TESSELI) and one
// external Google event later the same day, so the default day view (today)
// has something to render without any navigation. Sao Paulo has observed no
// DST since 2019 (fixed UTC-3), so the offset below is always correct.
function todaySaoPauloDateStr() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

{
  const today = todaySaoPauloDateStr();
  const starts = new Date(`${today}T09:00:00-03:00`);
  const ends = new Date(starts.getTime() + 50 * 60 * 1000);
  const [beatriz] = patientsByOrg.get(ADMIN_ORG_ID).values();

  seedAppointment(ADMIN_ORG_ID, {
    patient_id: beatriz.id,
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    summary_snapshot: `${beatriz.full_name} • ${beatriz.public_code}`,
  });

  const completedStart = new Date(`${today}T13:00:00-03:00`);
  const completedEnd = new Date(completedStart.getTime() + 50 * 60 * 1000);
  seedAppointment(ADMIN_ORG_ID, {
    patient_id: beatriz.id,
    status: "completed",
    starts_at: completedStart.toISOString(),
    ends_at: completedEnd.toISOString(),
    summary_snapshot: "Consulta B — realizada",
  });

  const cancelledStart = new Date(`${today}T15:00:00-03:00`);
  const cancelledEnd = new Date(cancelledStart.getTime() + 50 * 60 * 1000);
  seedAppointment(ADMIN_ORG_ID, {
    patient_id: beatriz.id,
    status: "cancelled",
    starts_at: cancelledStart.toISOString(),
    ends_at: cancelledEnd.toISOString(),
    summary_snapshot: "Consulta C — cancelada",
  });

  const externalStart = new Date(`${today}T11:00:00-03:00`);
  const externalEnd = new Date(externalStart.getTime() + 60 * 60 * 1000);
  seedAppointment(ADMIN_ORG_ID, {
    origin: "GOOGLE_EXTERNAL",
    managed_by_tesseli: false,
    google_calendar_id: "primary",
    google_event_id: "external-evt-1",
    summary_snapshot: "Reunião do conselho regional",
    starts_at: externalStart.toISOString(),
    ends_at: externalEnd.toISOString(),
  });
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

function issueSession(user) {
  const accessToken = `test-access-${randomUUID()}`;
  tokensToUser.set(accessToken, user);
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 14400,
    refresh_token: `test-refresh-${randomUUID()}`,
    user,
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function bearerUser(req) {
  const header = req.headers["authorization"];
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return tokensToUser.get(header.slice("Bearer ".length)) ?? null;
}

function parseInFilter(value) {
  // PostgREST syntax: id=in.(a,b,c)
  const match = /^in\.\((.*)\)$/.exec(value ?? "");
  if (!match) {
    return null;
  }
  return match[1]
    .split(",")
    .map((item) => item.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

function parseEqFilter(value) {
  const match = /^eq\.(.*)$/.exec(value ?? "");
  return match ? match[1] : null;
}

/** Extracts the %term% out of `or=(a.ilike.%term%,b.ilike.%term%)`. */
function parseOrSearchTerm(value) {
  const match = /ilike\.%([^%]*)%/.exec(value ?? "");
  return match ? match[1].toLowerCase() : null;
}

function wantsSingleObject(req) {
  return (req.headers["accept"] ?? "").includes("vnd.pgrst.object");
}

/** Minimal PostgREST-style operator evaluator for eq/neq/lt/gt/not.in.(...). */
function matchesFilters(row, searchParams, ignoredKeys = new Set(["select", "order", "limit"])) {
  for (const [key, rawValue] of searchParams.entries()) {
    if (ignoredKeys.has(key) || !(key in row)) {
      continue;
    }
    const value = row[key];
    if (rawValue.startsWith("eq.")) {
      if (String(value) !== rawValue.slice(3)) return false;
    } else if (rawValue.startsWith("neq.")) {
      if (String(value) === rawValue.slice(4)) return false;
    } else if (rawValue.startsWith("lt.")) {
      if (!(new Date(value).getTime() < new Date(rawValue.slice(3)).getTime())) return false;
    } else if (rawValue.startsWith("gt.")) {
      if (!(new Date(value).getTime() > new Date(rawValue.slice(3)).getTime())) return false;
    } else if (rawValue === "is.null") {
      if (value !== null && value !== undefined) return false;
    } else if (rawValue.startsWith("in.(")) {
      const list = rawValue.slice(4, -1).split(",");
      if (!list.includes(String(value))) return false;
    } else if (rawValue.startsWith("lte.")) {
      if (String(value) > rawValue.slice(4)) return false;
    } else if (rawValue.startsWith("gte.")) {
      if (String(value) < rawValue.slice(4)) return false;
    } else if (rawValue.startsWith("not.in.(")) {
      const list = rawValue.slice("not.in.(".length, -1).split(",");
      if (list.includes(String(value))) return false;
    }
  }
  return true;
}

function applyOrder(rows, searchParams) {
  const order = searchParams.get("order");
  if (!order) return rows;
  const [field, direction = "asc"] = order.split(".");
  const sorted = [...rows].sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0));
  return direction === "desc" ? sorted.reverse() : sorted;
}

function applyLimit(rows, searchParams) {
  const raw = searchParams.get("limit");
  if (!raw) return rows;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return rows;
  return rows.slice(0, n);
}

function embedAppointmentRelations(row, select) {
  if (!select || !select.includes("patients(") || !row.patient_id) {
    return row;
  }
  const orgPatients = patientsByOrg.get(row.organization_id);
  const patient = orgPatients?.get(row.patient_id);
  if (!patient) {
    return { ...row, patients: null };
  }
  return {
    ...row,
    patients: {
      preferred_name: patient.preferred_name,
      public_code: patient.public_code,
      phone: patient.phone,
    },
  };
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const { pathname, searchParams } = url;

  if (pathname === "/health" && req.method === "GET") {
    json(res, 200, { ok: true });
    return;
  }

  // Playwright-only hook: toggle the seeded admin Google connection so Meu Dia
  // and Agenda can share the same visibility rule (connected → TESSELI +
  // GOOGLE_EXTERNAL). Always reset to disconnected in the test `finally`.
  if (pathname === "/e2e/google-connection" && req.method === "POST") {
    const body = await readBody(req);
    const status = body.status === "connected" ? "connected" : "disconnected";
    const current = getConnection(ADMIN_ORG_ID);
    connectionsByOrg.set(ADMIN_ORG_ID, { ...current, status });
    json(res, 200, { organization_id: ADMIN_ORG_ID, status });
    return;
  }

  // ------------------------------------------- Storage (Fase 8/9) ---
  // Minimal stand-ins for the Storage endpoints the admin/browser clients
  // call — just enough to exercise upload/download UI flows end to end.
  // They do not persist bytes or replicate Storage RLS; that boundary is
  // covered by tests/security/*.test.ts against real PostgreSQL.
  if (pathname.startsWith("/storage/v1/object/upload/sign/") && req.method === "POST") {
    const objectPath = pathname.replace("/storage/v1/object/upload/sign/", "");
    await readBody(req);
    json(res, 200, {
      url: `/object/upload/sign/${objectPath}?token=fake-upload-token`,
      token: "fake-upload-token",
    });
    return;
  }

  // uploadToSignedUrl() PUTs the actual bytes here (create-signed-url above
  // is a separate POST) — different HTTP method on the same path prefix.
  if (pathname.startsWith("/storage/v1/object/upload/sign/") && req.method === "PUT") {
    const objectPath = pathname.replace("/storage/v1/object/upload/sign/", "");
    await new Promise((resolve) => {
      req.on("data", () => {});
      req.on("end", resolve);
    });
    json(res, 200, { Key: objectPath });
    return;
  }

  if (pathname.startsWith("/storage/v1/object/sign/") && req.method === "POST") {
    const objectPath = pathname.replace("/storage/v1/object/sign/", "");
    await readBody(req);
    json(res, 200, { signedURL: `/object/sign/${objectPath}?token=fake-download-token` });
    return;
  }

  if (pathname.startsWith("/storage/v1/object/") && req.method === "POST") {
    await new Promise((resolve) => {
      req.on("data", () => {});
      req.on("end", resolve);
    });
    const objectPath = pathname.replace("/storage/v1/object/", "");
    json(res, 200, { Id: randomUUID(), Key: objectPath });
    return;
  }

  if (pathname.startsWith("/storage/v1/object/") && req.method === "DELETE") {
    await readBody(req);
    json(res, 200, []);
    return;
  }

  // ----------------------------------------------------------------- Auth ---
  if (pathname === "/auth/v1/token" && req.method === "POST") {
    const grantType = searchParams.get("grant_type");
    const body = await readBody(req);

    if (grantType === "password") {
      // Emails shaped like `novo-<id>@tesseli.test` are created on demand
      // with zero memberships, so each onboarding test gets an isolated user
      // instead of sharing mutable state across projects.
      if (
        !usersByEmail.has(body.email) &&
        /^novo-[a-z0-9-]+@tesseli\.test$/.test(body.email ?? "")
      ) {
        usersByEmail.set(body.email, makeUser(body.email, "Nova Profissional"));
      }

      const user = usersByEmail.get(body.email);
      if (user && body.password === PASSWORD) {
        json(res, 200, issueSession(user));
        return;
      }
      json(res, 400, {
        error: "invalid_grant",
        error_description: "Invalid login credentials",
        msg: "Invalid login credentials",
        error_code: "invalid_credentials",
      });
      return;
    }

    if (grantType === "refresh_token") {
      json(res, 200, issueSession(ADMIN));
      return;
    }

    json(res, 400, {
      msg: "Unsupported grant_type",
      error_code: "unsupported_grant_type",
    });
    return;
  }

  if (pathname === "/auth/v1/signup" && req.method === "POST") {
    const body = await readBody(req);
    const email = String(body.email ?? "").toLowerCase();
    if (!email || !body.password) {
      json(res, 400, { msg: "invalid signup", error_code: "validation_failed" });
      return;
    }
    const existing = usersByEmail.get(email);
    const user = existing ?? makeUser(email, "");
    usersByEmail.set(email, user);
    json(res, 200, issueSession(user));
    return;
  }

  if (pathname === "/auth/v1/user" && (req.method === "GET" || req.method === "PUT")) {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { msg: "invalid JWT", error_code: "bad_jwt" });
      return;
    }
    if (req.method === "PUT") {
      const body = await readBody(req);
      if (body?.data && typeof body.data === "object") {
        user.user_metadata = { ...user.user_metadata, ...body.data };
        user.updated_at = new Date().toISOString();
      }
    }
    json(res, 200, user);
    return;
  }

  if (pathname === "/auth/v1/logout" && req.method === "POST") {
    const header = req.headers["authorization"];
    if (header?.startsWith("Bearer ")) {
      tokensToUser.delete(header.slice("Bearer ".length));
    }
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (pathname === "/auth/v1/recover" && req.method === "POST") {
    json(res, 200, {});
    return;
  }

  // ------------------------------------------------------------- Data API ---
  if (pathname === "/rest/v1/organization_members" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    json(res, 200, memberships.get(user.id) ?? []);
    return;
  }

  if (pathname === "/rest/v1/organization_members" && (req.method === "PATCH" || req.method === "PUT")) {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const idFilter = parseEqFilter(searchParams.get("id"));
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    if (membershipRole(user.id, organizationId) !== "psychologist_admin") {
      json(res, 403, { message: "row-level security policy violation" });
      return;
    }
    let updated = null;
    for (const list of memberships.values()) {
      const row = list.find((item) => item.id === idFilter && item.organization_id === organizationId);
      if (row) {
        if (row.active && body.active === false && row.role === "psychologist_admin") {
          const remaining = membershipsForOrg(organizationId).filter(
            (item) => item.active && item.role === "psychologist_admin" && item.id !== row.id,
          );
          if (remaining.length === 0) {
            json(res, 400, {
              message: "organization must keep at least one active psychologist_admin",
            });
            return;
          }
        }
        Object.assign(row, body, { id: row.id, organization_id: row.organization_id });
        updated = row;
        break;
      }
    }
    json(res, 200, wantsSingleObject(req) ? updated : updated ? [updated] : []);
    return;
  }

  if (pathname === "/rest/v1/organizations" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const allowed = new Set(
      (memberships.get(user.id) ?? []).map((row) => row.organization_id),
    );
    const eqId = parseEqFilter(searchParams.get("id"));
    const requested = parseInFilter(searchParams.get("id")) ?? (eqId ? [eqId] : [...allowed]);
    const rows = requested
      .filter((id) => allowed.has(id))
      .map((id) => organizations.get(id))
      .filter(Boolean)
      .map(({ id, name, slug, timezone, status }) => ({
        id,
        name,
        slug,
        timezone,
        status,
      }));
    json(res, 200, wantsSingleObject(req) ? (rows[0] ?? null) : rows);
    return;
  }

  if (pathname === "/rest/v1/organizations" && (req.method === "PATCH" || req.method === "PUT")) {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const idFilter = parseEqFilter(searchParams.get("id"));
    if (!idFilter || membershipRole(user.id, idFilter) !== "psychologist_admin") {
      json(res, 403, { message: "row-level security policy violation" });
      return;
    }
    const current = organizations.get(idFilter);
    if (!current) {
      json(res, 200, wantsSingleObject(req) ? null : []);
      return;
    }
    const next = { ...current, ...body, id: current.id };
    organizations.set(idFilter, next);
    json(res, 200, wantsSingleObject(req) ? next : [next]);
    return;
  }

  if (pathname === "/rest/v1/rpc/organization_shell_settings" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const isMember = (memberships.get(user.id) ?? []).some(
      (row) => row.organization_id === body.org_id && row.active,
    );
    const organization = organizations.get(body.org_id);
    if (!isMember || !organization) {
      json(res, 200, []);
      return;
    }
    json(res, 200, [
      {
        organization_id: organization.id,
        organization_name: organization.name,
        timezone: organization.timezone,
        professional_name:
          practiceSettingsByOrg.get(body.org_id)?.professional_name ??
          organization.professional_name,
        clinic_name:
          practiceSettingsByOrg.get(body.org_id)?.clinic_name ?? organization.clinic_name,
        inactivity_timeout_minutes:
          practiceSettingsByOrg.get(body.org_id)?.inactivity_timeout_minutes ??
          organization.inactivity_timeout_minutes,
        session_duration_minutes:
          practiceSettingsByOrg.get(body.org_id)?.session_duration_minutes ??
          organization.session_duration_minutes,
        greeting_prefix: practiceSettingsByOrg.get(body.org_id)?.greeting_prefix ?? null,
        quote: practiceSettingsByOrg.get(body.org_id)?.quote ?? null,
      },
    ]);
    return;
  }

  if (pathname === "/rest/v1/rpc/claim_platform_operator" && req.method === "POST") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    if (platformOperators.size === 0) {
      platformOperators.add(user.id);
      json(res, 200, true);
      return;
    }
    json(res, 200, platformOperators.has(user.id));
    return;
  }

  if (pathname === "/rest/v1/rpc/platform_bootstrap_state" && req.method === "POST") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    json(res, 200, [
      {
        is_operator: platformOperators.has(user.id),
        operators_exist: platformOperators.size > 0,
      },
    ]);
    return;
  }

  if (pathname === "/rest/v1/rpc/accept_pending_invitations" && req.method === "POST") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    let accepted = 0;
    for (const invitation of pendingInvitations) {
      if (
        invitation.status === "pending" &&
        invitation.email === user.email.toLowerCase()
      ) {
        addMembership(user.id, invitation.organization_id, invitation.role);
        invitation.status = "accepted";
        accepted += 1;
      }
    }
    json(res, 200, accepted);
    return;
  }

  if (pathname === "/rest/v1/rpc/list_assignable_psychologists" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    if (!membershipRole(user.id, body.p_org_id)) {
      json(res, 403, { message: "not authorized", code: "42501" });
      return;
    }
    json(
      res,
      200,
      membershipsForOrg(body.p_org_id).filter(
        (row) => row.role === "psychologist_admin" || row.role === "psychologist",
      ),
    );
    return;
  }

  if (pathname === "/rest/v1/rpc/bootstrap_organization" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    if (!platformOperators.has(user.id)) {
      json(res, 403, { message: "organization bootstrap requires a platform operator", code: "42501" });
      return;
    }
    const id = seedOrganization({
      name: body.org_name,
      slug: body.org_slug,
      userId: user.id,
      role: "psychologist_admin",
    });
    json(res, 200, id);
    return;
  }

  if (pathname === "/rest/v1/rpc/list_organization_members" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    if (membershipRole(user.id, body.p_org_id) !== "psychologist_admin") {
      json(res, 403, { message: "not authorized", code: "42501" });
      return;
    }
    json(res, 200, membershipsForOrg(body.p_org_id));
    return;
  }

  if (pathname === "/rest/v1/rpc/invite_organization_member" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    if (membershipRole(user.id, body.p_org_id) !== "psychologist_admin") {
      json(res, 403, { message: "not authorized", code: "42501" });
      return;
    }
    const invited = usersByEmail.get(String(body.p_email ?? "").toLowerCase())
      ?? [...usersByEmail.values()].find(
        (item) => item.email.toLowerCase() === String(body.p_email ?? "").toLowerCase(),
      );
    if (!invited) {
      const invitation = {
        id: randomUUID(),
        organization_id: body.p_org_id,
        email: String(body.p_email ?? "").toLowerCase(),
        role: body.p_role,
        status: "pending",
      };
      pendingInvitations.push(invitation);
      json(res, 200, invitation.id);
      return;
    }
    const existing = membershipsForOrg(body.p_org_id).find((row) => row.user_id === invited.id);
    if (existing) {
      existing.role = body.p_role;
      existing.active = true;
      json(res, 200, existing.id);
      return;
    }
    const row = addMembership(invited.id, body.p_org_id, body.p_role);
    json(res, 200, row.id);
    return;
  }

  if (pathname === "/rest/v1/rpc/purge_expired_fallback_audio" && req.method === "POST") {
    json(res, 200, 0);
    return;
  }

  if (pathname === "/rest/v1/rpc/expire_stale_logical_exports" && req.method === "POST") {
    json(res, 200, 0);
    return;
  }

  if (pathname === "/rest/v1/patients" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }

    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    const idFilter = parseEqFilter(searchParams.get("id"));
    const statusFilter = parseEqFilter(searchParams.get("status"));
    const searchTerm = parseOrSearchTerm(searchParams.get("or"));

    const isMember = (memberships.get(user.id) ?? []).some(
      (row) => row.active && (organizationId ? row.organization_id === organizationId : true),
    );

    let rows = [];
    if (idFilter) {
      // getPatient() filters by id only, then checks organization_id itself —
      // return the patient from any org the caller belongs to.
      for (const [orgId, table] of patientsByOrg.entries()) {
        const isOrgMember = (memberships.get(user.id) ?? []).some(
          (m) => m.active && m.organization_id === orgId,
        );
        if (isOrgMember && table.has(idFilter)) {
          rows = [table.get(idFilter)];
          break;
        }
      }
    } else if (organizationId && isMember) {
      rows = [...(patientsByOrg.get(organizationId)?.values() ?? [])];
      if (statusFilter) {
        rows = rows.filter((row) => row.status === statusFilter);
      }
      if (searchTerm) {
        rows = rows.filter(
          (row) =>
            row.preferred_name.toLowerCase().includes(searchTerm) ||
            row.full_name.toLowerCase().includes(searchTerm) ||
            row.public_code.toLowerCase().includes(searchTerm),
        );
      }
      rows.sort((a, b) => a.preferred_name.localeCompare(b.preferred_name));
    }

    if (wantsSingleObject(req)) {
      if (rows.length !== 1) {
        json(res, 406, { message: "JSON object requested, multiple (or no) rows returned" });
        return;
      }
      json(res, 200, rows[0]);
      return;
    }

    json(res, 200, rows);
    return;
  }

  if (pathname === "/rest/v1/patients" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }

    const isMember = (memberships.get(user.id) ?? []).some(
      (row) => row.active && row.organization_id === body.organization_id,
    );
    if (!isMember) {
      json(res, 403, { message: "row-level security policy violation" });
      return;
    }

    const role = membershipRole(user.id, body.organization_id);
    const patient = seedPatient(body.organization_id, {
      preferred_name: body.preferred_name,
      full_name: body.full_name,
      birth_date: body.birth_date ?? null,
      cpf: body.cpf ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      responsibles: body.responsibles ?? [],
      modality: body.modality ?? "in_person",
      status: body.status ?? "active",
      default_session_value: body.default_session_value ?? null,
      responsible_psychologist_user_id:
        body.responsible_psychologist_user_id
        ?? (isClinicalRole(role) ? user.id : firstClinicalUser(body.organization_id)),
    });

    if (wantsSingleObject(req)) {
      json(res, 201, patient);
      return;
    }
    json(res, 201, [patient]);
    return;
  }

  if (pathname === "/rest/v1/patients" && (req.method === "PATCH" || req.method === "PUT")) {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }

    const idFilter = parseEqFilter(searchParams.get("id"));
    let updated = null;
    for (const [orgId, table] of patientsByOrg.entries()) {
      const role = membershipRole(user.id, orgId);
      const isOrgMember = Boolean(role);
      if (
        isOrgMember &&
        idFilter &&
        table.has(idFilter) &&
        body.elimination_status &&
        role !== "psychologist_admin"
      ) {
        json(res, 403, { message: "only psychologist_admin may change elimination_status" });
        return;
      }
      if (isOrgMember && idFilter && table.has(idFilter)) {
        const current = table.get(idFilter);
        updated = {
          ...current,
          ...body,
          id: current.id,
          organization_id: current.organization_id,
          public_code: current.public_code,
          updated_at: new Date().toISOString(),
        };
        table.set(idFilter, updated);
        break;
      }
    }

    if (!updated) {
      json(res, wantsSingleObject(req) ? 406 : 200, wantsSingleObject(req) ? { message: "not found" } : []);
      return;
    }

    if (wantsSingleObject(req)) {
      json(res, 200, updated);
      return;
    }
    json(res, 200, [updated]);
    return;
  }

  if (pathname === "/rest/v1/patient_clinical_profile" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const patientId = parseEqFilter(searchParams.get("patient_id"));
    const profile = patientId ? clinicalProfiles.get(patientId) : null;
    json(res, 200, profile ? [profile] : []);
    return;
  }

  if (pathname === "/rest/v1/patient_clinical_profile" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }

    const isSecretary = (memberships.get(user.id) ?? []).some(
      (row) =>
        row.active &&
        row.role === "secretary" &&
        [...patientsByOrg.get(row.organization_id)?.values() ?? []].some(
          (patient) => patient.id === body.patient_id,
        ),
    );
    if (isSecretary) {
      json(res, 403, { message: "row-level security policy violation" });
      return;
    }

    // Mirrors sync_patient_clinical_profile_org(): organization_id always
    // comes from the parent patient, never trusted from the client body.
    let derivedOrganizationId;
    for (const [orgId, table] of patientsByOrg.entries()) {
      if (table.has(body.patient_id)) {
        derivedOrganizationId = orgId;
        break;
      }
    }

    const existing = clinicalProfiles.get(body.patient_id);
    const merged = {
      patient_id: body.patient_id,
      organization_id: derivedOrganizationId ?? existing?.organization_id,
      chief_complaint: body.chief_complaint ?? existing?.chief_complaint ?? null,
      history: body.history ?? existing?.history ?? null,
      therapy_goals: body.therapy_goals ?? existing?.therapy_goals ?? null,
      schemas: body.schemas ?? existing?.schemas ?? null,
      core_beliefs: body.core_beliefs ?? existing?.core_beliefs ?? null,
      general_clinical_notes:
        body.general_clinical_notes ?? existing?.general_clinical_notes ?? null,
    };
    clinicalProfiles.set(body.patient_id, merged);

    json(res, 201, wantsSingleObject(req) ? merged : [merged]);
    return;
  }

  if (pathname === "/rest/v1/appointments" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }

    const idFilter = parseEqFilter(searchParams.get("id"));
    const orgIds = new Set((memberships.get(user.id) ?? []).map((m) => m.organization_id));

    let rows = [];
    if (idFilter) {
      for (const orgId of orgIds) {
        const table = appointmentsByOrg.get(orgId);
        if (table?.has(idFilter)) {
          rows = [table.get(idFilter)];
          break;
        }
      }
    } else {
      const organizationId = parseEqFilter(searchParams.get("organization_id"));
      if (organizationId && orgIds.has(organizationId)) {
        const table = appointmentsByOrg.get(organizationId) ?? new Map();
        rows = applyOrder(
          [...table.values()].filter((row) => matchesFilters(row, searchParams)),
          searchParams,
        );
      }
    }

    if (wantsSingleObject(req)) {
      if (rows.length !== 1) {
        json(res, 406, { message: "JSON object requested, multiple (or no) rows returned" });
        return;
      }
      json(res, 200, embedAppointmentRelations(rows[0], searchParams.get("select")));
      return;
    }
    json(
      res,
      200,
      rows.map((row) => embedAppointmentRelations(row, searchParams.get("select"))),
    );
    return;
  }

  if (pathname === "/rest/v1/appointments" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const isMember = (memberships.get(user.id) ?? []).some(
      (row) => row.active && row.organization_id === body.organization_id,
    );
    if (!isMember) {
      json(res, 403, { message: "row-level security policy violation" });
      return;
    }

    const appointment = seedAppointment(body.organization_id, {
      patient_id: body.patient_id ?? null,
      starts_at: body.starts_at,
      ends_at: body.ends_at,
      modality: body.modality ?? "in_person",
      summary_snapshot: body.summary_snapshot ?? null,
      create_idempotency_key: body.create_idempotency_key ?? randomUUID(),
    });

    json(res, 201, wantsSingleObject(req) ? appointment : [appointment]);
    return;
  }

  if (pathname === "/rest/v1/appointments" && (req.method === "PATCH" || req.method === "PUT")) {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }

    const idFilter = parseEqFilter(searchParams.get("id"));
    let updated = null;
    for (const orgId of (memberships.get(user.id) ?? []).map((m) => m.organization_id)) {
      const table = appointmentsByOrg.get(orgId);
      if (table?.has(idFilter)) {
        const current = table.get(idFilter);
        updated = { ...current, ...body, id: current.id, updated_at: new Date().toISOString() };
        table.set(idFilter, updated);
        break;
      }
    }

    if (!updated) {
      json(res, wantsSingleObject(req) ? 406 : 200, wantsSingleObject(req) ? { message: "not found" } : []);
      return;
    }
    json(res, 200, wantsSingleObject(req) ? updated : [updated]);
    return;
  }

  if (pathname === "/rest/v1/google_calendar_connections" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    const isMember = (memberships.get(user.id) ?? []).some(
      (row) => row.active && row.organization_id === organizationId,
    );
    const rows = isMember ? [getConnection(organizationId)] : [];
    json(res, 200, wantsSingleObject(req) ? rows[0] ?? null : rows);
    return;
  }

  if (
    pathname === "/rest/v1/google_calendar_connections" &&
    (req.method === "PATCH" || req.method === "PUT")
  ) {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    const current = getConnection(organizationId);
    const updated = { ...current, ...body };
    connectionsByOrg.set(organizationId, updated);
    json(res, 200, wantsSingleObject(req) ? updated : [updated]);
    return;
  }

  if (pathname === "/rest/v1/rpc/log_audit_event" && req.method === "POST") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    json(res, 200, randomUUID());
    return;
  }

  if (pathname === "/rest/v1/rpc/log_calendar_sync_event" && req.method === "POST") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    json(res, 200, randomUUID());
    return;
  }

  if (pathname === "/rest/v1/consents" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    const role = organizationId ? membershipRole(user.id, organizationId) : null;
    if (!role) {
      json(res, 200, []);
      return;
    }

    const table = consentsByOrg.get(organizationId) ?? new Map();
    const rows = applyOrder(
      [...table.values()]
        .filter((row) => matchesFilters(row, searchParams))
        // Mirrors consents_select_admin_or_administrative.
        .filter(
          (row) =>
            role === "psychologist_admin" ||
            ADMINISTRATIVE_CONSENT_TYPES.has(row.type),
        ),
      searchParams,
    );
    json(res, 200, rows);
    return;
  }

  if (pathname === "/rest/v1/consents" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const consentRole = membershipRole(user.id, body.organization_id);
    if (
      consentRole !== "psychologist_admin" &&
      !(consentRole && ADMINISTRATIVE_CONSENT_TYPES.has(body.type))
    ) {
      json(res, 403, { message: "row-level security policy violation" });
      return;
    }

    const now = new Date().toISOString();
    const consent = {
      id: randomUUID(),
      organization_id: body.organization_id,
      patient_id: body.patient_id,
      type: body.type,
      title: body.title,
      version: body.version,
      status: body.status ?? "pending",
      accepted_at: body.status === "accepted" ? now : null,
      accepted_by: body.status === "accepted" ? user.id : null,
      expires_at: body.expires_at ?? null,
      guardian_authorization: body.guardian_authorization ?? false,
      guardian_name: body.guardian_name ?? null,
      patient_assent: body.patient_assent ?? false,
      revoked_at: null,
      created_at: now,
      updated_at: now,
    };
    getOrCreateOrgMap(consentsByOrg, body.organization_id).set(consent.id, consent);
    json(res, 201, wantsSingleObject(req) ? consent : [consent]);
    return;
  }

  if (pathname === "/rest/v1/consents" && (req.method === "PATCH" || req.method === "PUT")) {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }

    const idFilter = parseEqFilter(searchParams.get("id"));
    let updated = null;
    for (const [orgId, table] of consentsByOrg.entries()) {
      const role = membershipRole(user.id, orgId);
      const current = table.get(idFilter);
      if (
        current &&
        (role === "psychologist_admin" ||
          (role && ADMINISTRATIVE_CONSENT_TYPES.has(current.type)))
      ) {
        updated = {
          ...current,
          ...body,
          id: current.id,
          organization_id: current.organization_id,
          patient_id: current.patient_id,
          type: current.type,
          version: current.version,
          revoked_at:
            body.status === "revoked" ? new Date().toISOString() : current.revoked_at,
          updated_at: new Date().toISOString(),
        };
        table.set(idFilter, updated);
        break;
      }
    }

    if (!updated) {
      json(res, wantsSingleObject(req) ? 406 : 200, wantsSingleObject(req) ? { message: "not found" } : []);
      return;
    }
    json(res, 200, wantsSingleObject(req) ? updated : [updated]);
    return;
  }

  if (pathname === "/rest/v1/rpc/ensure_whatsapp_templates" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    if (!membershipRole(user.id, body.p_org_id)) {
      return json(res, 403, { message: "not authorized" });
    }
    ensureWhatsappTemplates(body.p_org_id);
    return json(res, 200, null);
  }

  if (pathname === "/rest/v1/rpc/patient_whatsapp_allowed" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    if (!membershipRole(user.id, body.p_org_id)) {
      return json(res, 200, false);
    }
    return json(res, 200, patientWhatsappAllowed(body.p_org_id, body.p_patient_id));
  }

  if (pathname === "/rest/v1/communication_preferences" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    const patientId = parseEqFilter(searchParams.get("patient_id"));
    if (!organizationId || !membershipRole(user.id, organizationId)) {
      return json(res, 200, wantsSingleObject(req) ? null : []);
    }
    const rows = [...communicationPreferences.values()].filter(
      (row) =>
        row.organization_id === organizationId &&
        (!patientId || row.patient_id === patientId),
    );
    if (wantsSingleObject(req)) {
      return json(res, 200, rows[0] ?? null);
    }
    return json(res, 200, rows);
  }

  if (pathname === "/rest/v1/communication_preferences" && (req.method === "POST" || req.method === "PATCH" || req.method === "PUT")) {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const organizationId = body.organization_id ?? parseEqFilter(searchParams.get("organization_id"));
    const patientId = body.patient_id ?? parseEqFilter(searchParams.get("patient_id"));
    if (!organizationId || !patientId || !membershipRole(user.id, organizationId)) {
      return json(res, 403, { message: "row-level security policy violation" });
    }
    const current = communicationPreferences.get(patientId) ?? {
      patient_id: patientId,
      organization_id: organizationId,
      whatsapp_enabled: false,
      consent_id: null,
      quiet_hours_start: null,
      quiet_hours_end: null,
    };
    const next = { ...current, ...body, patient_id: patientId, organization_id: organizationId };
    if (next.whatsapp_enabled) {
      const hasConsent = [...(consentsByOrg.get(organizationId)?.values() ?? [])].some(
        (row) =>
          row.patient_id === patientId &&
          row.type === "whatsapp" &&
          row.status === "accepted" &&
          (!next.consent_id || row.id === next.consent_id),
      );
      if (!hasConsent) {
        return json(res, 400, { message: "whatsapp preference requires an accepted whatsapp consent", code: "P0001" });
      }
    }
    communicationPreferences.set(patientId, next);
    ensureWhatsappTemplates(organizationId);
    return json(res, req.method === "POST" ? 201 : 200, wantsSingleObject(req) ? next : [next]);
  }

  if (pathname === "/rest/v1/whatsapp_templates" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    if (!organizationId || !membershipRole(user.id, organizationId)) {
      return json(res, 200, []);
    }
    const rows = [...(whatsappTemplatesByOrg.get(organizationId)?.values() ?? [])].filter((row) =>
      matchesFilters(row, searchParams),
    );
    return json(res, 200, applyOrder(rows, searchParams));
  }

  if (pathname === "/rest/v1/whatsapp_reminder_outbox" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    if (!organizationId || !membershipRole(user.id, organizationId)) {
      return json(res, 200, []);
    }
    const rows = [...(whatsappOutboxByOrg.get(organizationId)?.values() ?? [])].filter((row) =>
      matchesFilters(row, searchParams),
    );
    return json(res, 200, applyOrder(rows, searchParams));
  }

  if (pathname === "/rest/v1/whatsapp_messages" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    if (!organizationId || !membershipRole(user.id, organizationId)) {
      return json(res, 200, []);
    }
    const rows = [...(whatsappMessagesByOrg.get(organizationId)?.values() ?? [])].filter((row) =>
      matchesFilters(row, searchParams),
    );
    return json(res, 200, applyLimit(applyOrder(rows, searchParams), searchParams));
  }

  if (pathname === "/rest/v1/whatsapp_messages" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    if (!membershipRole(user.id, body.organization_id)) {
      return json(res, 403, { message: "row-level security policy violation" });
    }
    const row = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sent_at: null,
      body_redacted: body.template_key ?? null,
      ...body,
    };
    getOrCreateOrgMap(whatsappMessagesByOrg, body.organization_id).set(row.id, row);
    return json(res, 201, wantsSingleObject(req) ? row : [row]);
  }

  if (pathname === "/rest/v1/whatsapp_inbound_messages" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    if (!organizationId || !membershipRole(user.id, organizationId)) {
      return json(res, 200, []);
    }
    const rows = [...(whatsappInboundByOrg.get(organizationId)?.values() ?? [])].filter((row) =>
      matchesFilters(row, searchParams),
    );
    return json(res, 200, applyLimit(applyOrder(rows, searchParams), searchParams));
  }

  if (pathname === "/rest/v1/practice_tasks" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    const orgIds = new Set((memberships.get(user.id) ?? []).map((m) => m.organization_id));
    if (!organizationId || !orgIds.has(organizationId)) {
      json(res, 200, []);
      return;
    }
    const table = practiceTasksByOrg.get(organizationId) ?? new Map();
    const rows = applyOrder(
      [...table.values()].filter((row) => matchesFilters(row, searchParams)),
      searchParams,
    );
    json(res, 200, rows);
    return;
  }

  if (pathname === "/rest/v1/practice_tasks" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const isMember = (memberships.get(user.id) ?? []).some(
      (row) => row.active && row.organization_id === body.organization_id,
    );
    if (!isMember) {
      json(res, 403, { message: "row-level security policy violation" });
      return;
    }
    const now = new Date().toISOString();
    const task = {
      id: randomUUID(),
      organization_id: body.organization_id,
      title: body.title,
      notes: body.notes ?? null,
      due_at: body.due_at ?? null,
      completed_at: null,
      created_by_user_id: user.id,
      created_at: now,
      updated_at: now,
    };
    getOrCreateOrgMap(practiceTasksByOrg, body.organization_id).set(task.id, task);
    json(res, 201, wantsSingleObject(req) ? task : [task]);
    return;
  }

  if (pathname === "/rest/v1/practice_tasks" && (req.method === "PATCH" || req.method === "PUT")) {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const idFilter = parseEqFilter(searchParams.get("id"));
    let updated = null;
    for (const orgId of (memberships.get(user.id) ?? []).map((m) => m.organization_id)) {
      const table = practiceTasksByOrg.get(orgId);
      if (table?.has(idFilter)) {
        const current = table.get(idFilter);
        updated = { ...current, ...body, id: current.id, updated_at: new Date().toISOString() };
        table.set(idFilter, updated);
        break;
      }
    }
    if (!updated) {
      json(res, wantsSingleObject(req) ? 406 : 200, wantsSingleObject(req) ? { message: "not found" } : []);
      return;
    }
    json(res, 200, wantsSingleObject(req) ? updated : [updated]);
    return;
  }

  if (pathname === "/rest/v1/practice_tasks" && req.method === "DELETE") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const idFilter = parseEqFilter(searchParams.get("id"));
    let deleted = null;
    for (const orgId of (memberships.get(user.id) ?? []).map((m) => m.organization_id)) {
      const table = practiceTasksByOrg.get(orgId);
      if (table?.has(idFilter)) {
        deleted = table.get(idFilter);
        table.delete(idFilter);
        break;
      }
    }
    json(res, 200, wantsSingleObject(req) ? deleted : deleted ? [deleted] : []);
    return;
  }

  // -------------------------------------------------------- Fase 6: sessão ---
  if (pathname === "/rest/v1/rpc/start_clinical_session" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    if (!isClinicalRole(membershipRole(user.id, body.org_id))) {
      json(res, 403, { message: "row-level security policy violation" });
      return;
    }
    const responsible =
      patientsByOrg.get(body.org_id)?.get(body.p_patient_id)?.responsible_psychologist_user_id;
    if (responsible !== user.id) {
      json(res, 403, { message: "row-level security policy violation" });
      return;
    }

    const table = getOrCreateOrgMap(clinicalSessionsByOrg, body.org_id);
    const existing = [...table.values()].find(
      (row) =>
        row.patient_id === body.p_patient_id &&
        (row.status === "draft" || row.status === "in_progress"),
    );
    if (existing) {
      existing.status = "in_progress";
      existing.started_at = existing.started_at ?? new Date().toISOString();
      json(res, 200, existing.id);
      return;
    }

    const now = new Date().toISOString();
    const session = {
      id: randomUUID(),
      organization_id: body.org_id,
      patient_id: body.p_patient_id,
      appointment_id: body.p_appointment_id ?? null,
      therapist_user_id: user.id,
      status: "in_progress",
      started_at: now,
      ended_at: null,
      finalization_idempotency_key: null,
      version: 1,
      created_at: now,
    };
    table.set(session.id, session);
    json(res, 200, session.id);
    return;
  }

  if (pathname === "/rest/v1/rpc/save_session_dpep" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    if (membershipRole(user.id, body.org_id) !== "psychologist_admin") {
      json(res, 200, []);
      return;
    }
    const session = clinicalSessionsByOrg.get(body.org_id)?.get(body.p_session_id);
    if (!session || session.version !== body.p_expected_version) {
      json(res, 200, []);
      return;
    }
    session.version += 1;
    const dpepTable = getOrCreateOrgMap(sessionDpepByOrg, body.org_id);
    const now = new Date().toISOString();
    dpepTable.set(body.p_session_id, {
      session_id: body.p_session_id,
      organization_id: body.org_id,
      demand: body.p_demand,
      procedures: body.p_procedures,
      evolution: body.p_evolution,
      plan: body.p_plan,
      version: session.version,
      updated_by: user.id,
      updated_at: now,
      created_at: dpepTable.get(body.p_session_id)?.created_at ?? now,
    });
    json(res, 200, [{ new_version: session.version }]);
    return;
  }

  if (pathname === "/rest/v1/rpc/save_session_working_notes" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    if (membershipRole(user.id, body.org_id) !== "psychologist_admin") {
      json(res, 200, []);
      return;
    }
    const session = clinicalSessionsByOrg.get(body.org_id)?.get(body.p_session_id);
    if (!session || session.version !== body.p_expected_version) {
      json(res, 200, []);
      return;
    }
    session.version += 1;
    const notesTable = getOrCreateOrgMap(sessionWorkingNotesByOrg, body.org_id);
    const now = new Date().toISOString();
    notesTable.set(body.p_session_id, {
      session_id: body.p_session_id,
      organization_id: body.org_id,
      formulation: body.p_formulation,
      hypotheses: body.p_hypotheses,
      working_observations: body.p_working_observations,
      updated_by: user.id,
      updated_at: now,
      created_at: notesTable.get(body.p_session_id)?.created_at ?? now,
    });
    json(res, 200, [{ new_version: session.version }]);
    return;
  }

  if (pathname === "/rest/v1/rpc/finalize_clinical_session" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    if (membershipRole(user.id, body.org_id) !== "psychologist_admin") {
      json(res, 200, []);
      return;
    }
    const session = clinicalSessionsByOrg.get(body.org_id)?.get(body.p_session_id);
    if (!session) {
      json(res, 200, []);
      return;
    }
    if (session.status === "finalized") {
      if (session.finalization_idempotency_key === body.p_idempotency_key) {
        json(res, 200, [{ out_status: session.status, out_ended_at: session.ended_at }]);
        return;
      }
      json(res, 200, []);
      return;
    }
    session.status = "finalized";
    session.ended_at = new Date().toISOString();
    session.finalization_idempotency_key = body.p_idempotency_key;
    json(res, 200, [{ out_status: session.status, out_ended_at: session.ended_at }]);
    return;
  }

  if (pathname === "/rest/v1/clinical_sessions" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const idFilter = parseEqFilter(searchParams.get("id"));
    const organizationId = parseEqFilter(searchParams.get("organization_id"));

    let rows = [];
    if (idFilter) {
      const row = findAdminScopedRow(clinicalSessionsByOrg, user.id, (r) => r.id === idFilter);
      rows = row ? [row] : [];
    } else if (organizationId && membershipRole(user.id, organizationId) === "psychologist_admin") {
      const table = clinicalSessionsByOrg.get(organizationId) ?? new Map();
      rows = applyLimit(
        applyOrder(
          [...table.values()].filter((row) => matchesFilters(row, searchParams)),
          searchParams,
        ),
        searchParams,
      );
    }

    const select = searchParams.get("select");
    const mapped = rows.map((row) => embedAppointmentRelations(row, select));

    if (wantsSingleObject(req)) {
      if (mapped.length !== 1) {
        json(res, 406, { message: "JSON object requested, multiple (or no) rows returned" });
        return;
      }
      json(res, 200, mapped[0]);
      return;
    }
    json(res, 200, mapped);
    return;
  }

  if (pathname === "/rest/v1/clinical_sessions" && (req.method === "PATCH" || req.method === "PUT")) {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const idFilter = parseEqFilter(searchParams.get("id"));
    const row = findAdminScopedRow(clinicalSessionsByOrg, user.id, (r) => r.id === idFilter);
    if (!row || row.status === "finalized") {
      json(res, 200, wantsSingleObject(req) ? null : []);
      return;
    }
    Object.assign(row, body, { id: row.id, organization_id: row.organization_id });
    json(res, 200, wantsSingleObject(req) ? row : [row]);
    return;
  }

  if (pathname === "/rest/v1/session_dpep" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const sessionId = parseEqFilter(searchParams.get("session_id"));
    const row = findAdminScopedRow(sessionDpepByOrg, user.id, (r) => r.session_id === sessionId);
    if (wantsSingleObject(req)) {
      if (!row) {
        json(res, 406, { message: "no rows" });
        return;
      }
      json(res, 200, row);
      return;
    }
    json(res, 200, row ? [row] : []);
    return;
  }

  if (pathname === "/rest/v1/session_clinical_working_notes" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const sessionId = parseEqFilter(searchParams.get("session_id"));
    const row = findAdminScopedRow(
      sessionWorkingNotesByOrg,
      user.id,
      (r) => r.session_id === sessionId,
    );
    if (wantsSingleObject(req)) {
      if (!row) {
        json(res, 406, { message: "no rows" });
        return;
      }
      json(res, 200, row);
      return;
    }
    json(res, 200, row ? [row] : []);
    return;
  }

  if (pathname === "/rest/v1/session_transcript_segments" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const sessionId = parseEqFilter(searchParams.get("session_id"));
    const matches = [];
    for (const [orgId, table] of transcriptSegmentsByOrg.entries()) {
      if (membershipRole(user.id, orgId) !== "psychologist_admin") continue;
      for (const row of table.values()) {
        if (row.session_id === sessionId) matches.push(row);
      }
    }
    json(res, 200, applyOrder(matches, searchParams));
    return;
  }

  if (pathname === "/rest/v1/session_transcript_segments" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    if (membershipRole(user.id, body.organization_id) !== "psychologist_admin") {
      json(res, 403, { message: "row-level security policy violation" });
      return;
    }
    const table = getOrCreateOrgMap(transcriptSegmentsByOrg, body.organization_id);
    const duplicate = [...table.values()].some(
      (row) => row.session_id === body.session_id && row.sequence === body.sequence,
    );
    if (duplicate) {
      json(res, 409, {
        code: "23505",
        message: "duplicate key value violates unique constraint",
      });
      return;
    }
    const segment = {
      id: randomUUID(),
      session_id: body.session_id,
      organization_id: body.organization_id,
      sequence: body.sequence,
      text: body.text,
      is_final: body.is_final ?? true,
      start_ms: body.start_ms ?? null,
      end_ms: body.end_ms ?? null,
      provider: body.provider,
      provider_confidence: body.provider_confidence ?? null,
      ambiguity_flags: body.ambiguity_flags ?? null,
      created_at: new Date().toISOString(),
    };
    table.set(segment.id, segment);
    json(res, 201, wantsSingleObject(req) ? segment : [segment]);
    return;
  }

  // -------------------------------------------- Fase 6/7: ai_runs/artifacts ---
  if (pathname === "/rest/v1/ai_runs" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const idFilter = parseEqFilter(searchParams.get("id"));
    const organizationId = parseEqFilter(searchParams.get("organization_id"));

    let rows = [];
    if (idFilter) {
      const row = findAdminScopedRow(aiRunsByOrg, user.id, (r) => r.id === idFilter);
      rows = row ? [row] : [];
    } else if (organizationId && membershipRole(user.id, organizationId) === "psychologist_admin") {
      rows = applyOrder(
        [...(aiRunsByOrg.get(organizationId)?.values() ?? [])].filter((row) =>
          matchesFilters(row, searchParams),
        ),
        searchParams,
      );
    }

    if (wantsSingleObject(req)) {
      if (rows.length !== 1) {
        json(res, 406, { message: "JSON object requested, multiple (or no) rows returned" });
        return;
      }
      json(res, 200, rows[0]);
      return;
    }
    json(res, 200, rows);
    return;
  }

  if (pathname === "/rest/v1/ai_runs" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    if (membershipRole(user.id, body.organization_id) !== "psychologist_admin") {
      json(res, 403, { message: "row-level security policy violation" });
      return;
    }
    const now = new Date().toISOString();
    const run = {
      id: randomUUID(),
      organization_id: body.organization_id,
      patient_id: body.patient_id ?? null,
      session_id: body.session_id ?? null,
      actor_user_id: user.id,
      purpose: body.purpose,
      provider: body.provider ?? "gemini",
      model: body.model,
      prompt_name: body.prompt_name,
      prompt_version: body.prompt_version,
      schema_version: body.schema_version,
      consent_version: body.consent_version ?? null,
      status: body.status ?? "running",
      source_ids: body.source_ids ?? null,
      error_message: null,
      created_at: now,
      completed_at: null,
    };
    getOrCreateOrgMap(aiRunsByOrg, body.organization_id).set(run.id, run);
    json(res, 201, wantsSingleObject(req) ? run : [run]);
    return;
  }

  if (pathname === "/rest/v1/ai_runs" && (req.method === "PATCH" || req.method === "PUT")) {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const idFilter = parseEqFilter(searchParams.get("id"));
    const row = findAdminScopedRow(aiRunsByOrg, user.id, (r) => r.id === idFilter);
    if (!row) {
      json(res, 200, wantsSingleObject(req) ? null : []);
      return;
    }
    Object.assign(row, body, { id: row.id, organization_id: row.organization_id });
    json(res, 200, wantsSingleObject(req) ? row : [row]);
    return;
  }

  if (pathname === "/rest/v1/ai_artifacts" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const idFilter = parseEqFilter(searchParams.get("id"));
    const runIdFilter = parseEqFilter(searchParams.get("run_id"));

    let rows = [];
    if (idFilter) {
      const row = findAdminScopedRow(aiArtifactsByOrg, user.id, (r) => r.id === idFilter);
      rows = row ? [row] : [];
    } else if (runIdFilter) {
      const row = findAdminScopedRow(aiArtifactsByOrg, user.id, (r) => r.run_id === runIdFilter);
      rows = row ? [row] : [];
    }

    if (wantsSingleObject(req)) {
      if (rows.length !== 1) {
        json(res, 406, { message: "JSON object requested, multiple (or no) rows returned" });
        return;
      }
      json(res, 200, rows[0]);
      return;
    }
    json(res, 200, rows);
    return;
  }

  if (pathname === "/rest/v1/ai_artifacts" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    if (membershipRole(user.id, body.organization_id) !== "psychologist_admin") {
      json(res, 403, { message: "row-level security policy violation" });
      return;
    }
    const now = new Date().toISOString();
    const artifact = {
      id: randomUUID(),
      run_id: body.run_id,
      organization_id: body.organization_id,
      type: body.type,
      structured_content: body.structured_content,
      review_status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      created_at: now,
      updated_at: now,
    };
    getOrCreateOrgMap(aiArtifactsByOrg, body.organization_id).set(artifact.id, artifact);
    json(res, 201, wantsSingleObject(req) ? artifact : [artifact]);
    return;
  }

  if (pathname === "/rest/v1/ai_artifacts" && (req.method === "PATCH" || req.method === "PUT")) {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const idFilter = parseEqFilter(searchParams.get("id"));
    const row = findAdminScopedRow(aiArtifactsByOrg, user.id, (r) => r.id === idFilter);
    if (!row) {
      json(res, 200, wantsSingleObject(req) ? null : []);
      return;
    }
    if (body.review_status && row.review_status === "pending" && body.review_status !== "pending") {
      row.reviewed_by = user.id;
      row.reviewed_at = new Date().toISOString();
    }
    Object.assign(row, body, {
      id: row.id,
      run_id: row.run_id,
      organization_id: row.organization_id,
      structured_content: row.structured_content,
    });
    row.updated_at = new Date().toISOString();
    json(res, 200, wantsSingleObject(req) ? row : [row]);
    return;
  }

  // ------------------------------------------------ Fase 8: Conhecimento ---
  if (pathname === "/rest/v1/knowledge_collections" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    if (!organizationId || membershipRole(user.id, organizationId) !== "psychologist_admin") {
      json(res, 200, []);
      return;
    }
    const rows = applyOrder(
      [...(knowledgeCollectionsByOrg.get(organizationId)?.values() ?? [])],
      searchParams,
    );
    json(res, 200, rows);
    return;
  }

  if (pathname === "/rest/v1/knowledge_collections" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    if (membershipRole(user.id, body.organization_id) !== "psychologist_admin") {
      json(res, 403, { message: "row-level security policy violation" });
      return;
    }
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      organization_id: body.organization_id,
      name: body.name,
      description: body.description ?? null,
      created_by: user.id,
      created_at: now,
      updated_at: now,
    };
    getOrCreateOrgMap(knowledgeCollectionsByOrg, body.organization_id).set(row.id, row);
    json(res, 201, wantsSingleObject(req) ? row : [row]);
    return;
  }

  if (pathname === "/rest/v1/knowledge_sources" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const idFilter = parseEqFilter(searchParams.get("id"));
    const organizationId = parseEqFilter(searchParams.get("organization_id"));

    let rows = [];
    if (idFilter) {
      const row = findAdminScopedRow(knowledgeSourcesByOrg, user.id, (r) => r.id === idFilter);
      rows = row ? [row] : [];
    } else if (organizationId && membershipRole(user.id, organizationId) === "psychologist_admin") {
      rows = applyOrder(
        [...(knowledgeSourcesByOrg.get(organizationId)?.values() ?? [])].filter((row) =>
          matchesFilters(row, searchParams),
        ),
        searchParams,
      );
    }

    if (wantsSingleObject(req)) {
      if (rows.length !== 1) {
        json(res, 406, { message: "JSON object requested, multiple (or no) rows returned" });
        return;
      }
      json(res, 200, rows[0]);
      return;
    }
    json(res, 200, rows);
    return;
  }

  if (pathname === "/rest/v1/knowledge_sources" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    if (membershipRole(user.id, body.organization_id) !== "psychologist_admin") {
      json(res, 403, { message: "row-level security policy violation" });
      return;
    }
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      organization_id: body.organization_id,
      collection_id: body.collection_id ?? null,
      title: body.title ?? null,
      authors: [],
      year: null,
      edition: null,
      document_type: null,
      study_design_or_source_role: null,
      language: null,
      theoretical_approaches: [],
      population_context: [],
      main_topics: [],
      system_tags: [],
      status: body.status ?? "uploaded",
      ingestion_error: null,
      storage_path: body.storage_path,
      mime_type: body.mime_type,
      byte_size: body.byte_size,
      sha256: body.sha256,
      uploaded_by: user.id,
      created_at: now,
      updated_at: now,
    };
    getOrCreateOrgMap(knowledgeSourcesByOrg, body.organization_id).set(row.id, row);
    json(res, 201, wantsSingleObject(req) ? row : [row]);
    return;
  }

  if (pathname === "/rest/v1/knowledge_sources" && (req.method === "PATCH" || req.method === "PUT")) {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const idFilter = parseEqFilter(searchParams.get("id"));
    const row = findAdminScopedRow(knowledgeSourcesByOrg, user.id, (r) => r.id === idFilter);
    if (!row) {
      json(res, 200, wantsSingleObject(req) ? null : []);
      return;
    }
    Object.assign(row, body, { id: row.id, organization_id: row.organization_id });
    row.updated_at = new Date().toISOString();
    json(res, 200, wantsSingleObject(req) ? row : [row]);
    return;
  }

  if (pathname === "/rest/v1/knowledge_sources" && req.method === "DELETE") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const idFilter = parseEqFilter(searchParams.get("id"));
    for (const table of knowledgeSourcesByOrg.values()) {
      if (table.has(idFilter)) {
        table.delete(idFilter);
        break;
      }
    }
    json(res, 200, []);
    return;
  }

  if (pathname === "/rest/v1/knowledge_documents" && (req.method === "POST" || req.method === "PATCH" || req.method === "PUT")) {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    if (membershipRole(user.id, body.organization_id) !== "psychologist_admin") {
      json(res, 403, { message: "row-level security policy violation" });
      return;
    }
    const table = getOrCreateOrgMap(knowledgeDocumentsByOrg, body.organization_id);
    const existing = [...table.values()].find((row) => row.source_id === body.source_id);
    const row = existing
      ? Object.assign(existing, body)
      : { id: randomUUID(), ...body, extracted_at: new Date().toISOString() };
    table.set(row.id, row);
    json(res, 201, wantsSingleObject(req) ? row : [row]);
    return;
  }

  if (pathname === "/rest/v1/knowledge_chunks" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    if (membershipRole(user.id, body.organization_id) !== "psychologist_admin") {
      json(res, 403, { message: "row-level security policy violation" });
      return;
    }
    const rowsIn = Array.isArray(body) ? body : [body];
    const table = getOrCreateOrgMap(knowledgeChunksByOrg, body.organization_id ?? rowsIn[0]?.organization_id);
    const created = rowsIn.map((entry) => {
      const row = { id: randomUUID(), ...entry };
      table.set(row.id, row);
      return row;
    });
    json(res, 201, wantsSingleObject(req) ? created[0] : created);
    return;
  }

  if (pathname === "/rest/v1/knowledge_chunks" && req.method === "DELETE") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const documentIdFilter = parseEqFilter(searchParams.get("document_id"));
    for (const table of knowledgeChunksByOrg.values()) {
      for (const [id, row] of table.entries()) {
        if (row.document_id === documentIdFilter) {
          table.delete(id);
        }
      }
    }
    json(res, 200, []);
    return;
  }

  if (pathname === "/rest/v1/knowledge_embeddings" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    if (membershipRole(user.id, body.organization_id ?? (Array.isArray(body) ? body[0]?.organization_id : undefined)) !== "psychologist_admin") {
      json(res, 403, { message: "row-level security policy violation" });
      return;
    }
    const rowsIn = Array.isArray(body) ? body : [body];
    json(res, 201, wantsSingleObject(req) ? rowsIn[0] : rowsIn);
    return;
  }

  // -------------------------------------------------- Fase 9: Documentos ---
  if (pathname === "/rest/v1/document_templates" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    const role = organizationId ? membershipRole(user.id, organizationId) : null;
    if (!organizationId || !role) return json(res, 200, []);
    const rows = [...(documentTemplatesByOrg.get(organizationId)?.values() ?? [])].filter(
      (row) => matchesFilters(row, searchParams) && isSensitivityVisible(role, row.default_sensitivity),
    );
    return json(res, 200, applyOrder(rows, searchParams));
  }

  if (pathname === "/rest/v1/document_templates" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    if (membershipRole(user.id, body.organization_id) !== "psychologist_admin") {
      return json(res, 403, { message: "row-level security policy violation" });
    }
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      organization_id: body.organization_id,
      name: body.name,
      document_kind: body.document_kind,
      default_sensitivity: body.default_sensitivity,
      body_template: body.body_template ?? "",
      active: true,
      created_by: user.id,
      created_at: now,
      updated_at: now,
    };
    getOrCreateOrgMap(documentTemplatesByOrg, body.organization_id).set(row.id, row);
    return json(res, 201, wantsSingleObject(req) ? row : [row]);
  }

  if (pathname === "/rest/v1/documents" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const idFilter = parseEqFilter(searchParams.get("id"));
    const organizationId = parseEqFilter(searchParams.get("organization_id"));

    let rows = [];
    if (idFilter) {
      const row = findAdminScopedRow(documentsByOrg, user.id, (r) => r.id === idFilter);
      const role = row ? membershipRole(user.id, row.organization_id) : null;
      rows = row && (role === "psychologist_admin" || isSensitivityVisible(role, row.sensitivity))
        ? [row]
        : [];
      // findAdminScopedRow already restricts to admin; also allow secretary
      // for administrative-sensitivity rows explicitly.
      if (!row) {
        for (const [orgId, table] of documentsByOrg.entries()) {
          const secretaryRole = membershipRole(user.id, orgId);
          if (!secretaryRole) continue;
          const candidate = table.get(idFilter);
          if (candidate && isSensitivityVisible(secretaryRole, candidate.sensitivity)) {
            rows = [candidate];
          }
        }
      }
    } else if (organizationId) {
      const role = membershipRole(user.id, organizationId);
      if (role) {
        rows = applyOrder(
          [...(documentsByOrg.get(organizationId)?.values() ?? [])].filter(
            (row) => matchesFilters(row, searchParams) && isSensitivityVisible(role, row.sensitivity),
          ),
          searchParams,
        );
      }
    }

    if (wantsSingleObject(req)) {
      if (rows.length !== 1) {
        return json(res, 406, {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
          details: rows.length === 0 ? "Results contain 0 rows" : "Results contain multiple rows",
        });
      }
      return json(res, 200, rows[0]);
    }
    return json(res, 200, applyLimit(rows, searchParams));
  }

  if (pathname === "/rest/v1/documents" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const role = membershipRole(user.id, body.organization_id);
    let sensitivity = body.sensitivity;
    if (FORCED_CLINICAL_KINDS.has(body.document_kind)) sensitivity = "clinical";
    if (FORCED_ADMINISTRATIVE_KINDS.has(body.document_kind)) sensitivity = "administrative";
    if (!role || !isSensitivityVisible(role, sensitivity)) {
      return json(res, 403, { message: "row-level security policy violation" });
    }
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      organization_id: body.organization_id,
      patient_id: body.patient_id ?? null,
      template_id: body.template_id ?? null,
      title: body.title,
      document_kind: body.document_kind,
      sensitivity,
      status: "draft",
      current_version: 1,
      created_by: user.id,
      issued_at: null,
      canceled_at: null,
      created_at: now,
      updated_at: now,
      system_template_key: body.system_template_key ?? null,
      visual_profile: body.visual_profile ?? "clinica",
      logo_mode: body.logo_mode ?? "clinic_default",
      logo_align: body.logo_align ?? "left",
      logo_size: body.logo_size ?? "medium",
      recipient_name: body.recipient_name ?? null,
      purpose: body.purpose ?? null,
      structured_data: body.structured_data ?? {},
      drafting_mode: body.drafting_mode ?? "manual",
      length_preset: body.length_preset ?? "completo",
      tone: body.tone ?? "tecnico_clinico",
      cover_enabled: body.cover_enabled ?? false,
      layout_format: body.layout_format ?? "tradicional",
      reviewed_by: null,
      reviewed_at: null,
      review_sha256: null,
    };
    getOrCreateOrgMap(documentsByOrg, body.organization_id).set(row.id, row);
    return json(res, 201, wantsSingleObject(req) ? row : [row]);
  }

  if (pathname === "/rest/v1/documents" && (req.method === "PATCH" || req.method === "PUT")) {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const idFilter = parseEqFilter(searchParams.get("id"));
    let row = null;
    for (const table of documentsByOrg.values()) {
      if (table.has(idFilter)) {
        row = table.get(idFilter);
        break;
      }
    }
    const role = row ? membershipRole(user.id, row.organization_id) : null;
    if (!row || !role || !isSensitivityVisible(role, row.sensitivity)) {
      return json(res, 200, wantsSingleObject(req) ? null : []);
    }
    Object.assign(row, body, { id: row.id, organization_id: row.organization_id, sensitivity: row.sensitivity });
    row.updated_at = new Date().toISOString();
    return json(res, 200, wantsSingleObject(req) ? row : [row]);
  }

  if (pathname === "/rest/v1/document_versions" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const documentId = parseEqFilter(searchParams.get("document_id"));
    let parentDoc = null;
    for (const table of documentsByOrg.values()) {
      if (table.has(documentId)) {
        parentDoc = table.get(documentId);
        break;
      }
    }
    const role = parentDoc ? membershipRole(user.id, parentDoc.organization_id) : null;
    if (!parentDoc || !role || !isSensitivityVisible(role, parentDoc.sensitivity)) {
      return json(res, 200, []);
    }
    const rows = [...(documentVersionsByOrg.get(parentDoc.organization_id)?.values() ?? [])].filter(
      (row) => row.document_id === documentId,
    );
    return json(res, 200, applyOrder(rows, searchParams));
  }

  if (pathname === "/rest/v1/document_versions" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    let parentDoc = null;
    for (const table of documentsByOrg.values()) {
      if (table.has(body.document_id)) {
        parentDoc = table.get(body.document_id);
        break;
      }
    }
    const role = parentDoc ? membershipRole(user.id, parentDoc.organization_id) : null;
    if (!parentDoc || !role || !isSensitivityVisible(role, parentDoc.sensitivity)) {
      return json(res, 403, { message: "row-level security policy violation" });
    }
    const row = {
      id: randomUUID(),
      document_id: body.document_id,
      organization_id: body.organization_id,
      version: body.version,
      body_snapshot: body.body_snapshot,
      variables_snapshot: body.variables_snapshot ?? {},
      sections_snapshot: body.sections_snapshot ?? [],
      content_sha256: body.content_sha256 ?? null,
      created_by: user.id,
      created_at: new Date().toISOString(),
    };
    getOrCreateOrgMap(documentVersionsByOrg, body.organization_id).set(row.id, row);
    return json(res, 201, wantsSingleObject(req) ? row : [row]);
  }

  if (pathname === "/rest/v1/document_files" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const versionIdFilter = parseEqFilter(searchParams.get("document_version_id"));
    let match = null;
    for (const table of documentFilesByOrg.values()) {
      for (const row of table.values()) {
        if (row.document_version_id === versionIdFilter) match = row;
      }
    }
    if (wantsSingleObject(req)) {
      if (!match) {
        return json(res, 406, {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
          details: "Results contain 0 rows",
        });
      }
      return json(res, 200, match);
    }
    return json(res, 200, match ? [match] : []);
  }

  if (pathname === "/rest/v1/document_files" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const row = {
      id: randomUUID(),
      mime_type: "application/pdf",
      generated_at: new Date().toISOString(),
      ...body,
    };
    getOrCreateOrgMap(documentFilesByOrg, body.organization_id).set(row.id, row);
    return json(res, 201, wantsSingleObject(req) ? row : [row]);
  }

  if (pathname === "/rest/v1/document_branding" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    const row = organizationId ? documentBrandingByOrg.get(organizationId) : null;
    if (wantsSingleObject(req)) {
      if (!row) {
        return json(res, 406, {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
          details: "Results contain 0 rows",
        });
      }
      return json(res, 200, row);
    }
    return json(res, 200, row ? [row] : []);
  }

  if (pathname === "/rest/v1/document_branding" && (req.method === "POST" || req.method === "PATCH" || req.method === "PUT")) {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const organizationId = body.organization_id || parseEqFilter(searchParams.get("organization_id"));
    if (membershipRole(user.id, organizationId) !== "psychologist_admin") {
      return json(res, 403, { message: "row-level security policy violation" });
    }
    const current = documentBrandingByOrg.get(organizationId) ?? { organization_id: organizationId };
    const row = { ...current, ...body, organization_id: organizationId };
    documentBrandingByOrg.set(organizationId, row);
    return json(res, 200, wantsSingleObject(req) ? row : [row]);
  }

  if (pathname === "/rest/v1/document_logos" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    const role = organizationId ? membershipRole(user.id, organizationId) : null;
    if (!organizationId || !role) return json(res, 200, []);
    return json(res, 200, [...(documentLogosByOrg.get(organizationId)?.values() ?? [])]);
  }

  if (pathname === "/rest/v1/document_logos" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    if (membershipRole(user.id, body.organization_id) !== "psychologist_admin") {
      return json(res, 403, { message: "row-level security policy violation" });
    }
    const row = {
      id: randomUUID(),
      is_default: false,
      created_at: new Date().toISOString(),
      ...body,
    };
    getOrCreateOrgMap(documentLogosByOrg, body.organization_id).set(row.id, row);
    return json(res, 201, wantsSingleObject(req) ? row : [row]);
  }

  if (pathname === "/rest/v1/document_template_favorites" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    const rows = [...(documentFavoritesByOrg.get(organizationId)?.values() ?? [])].filter(
      (row) => row.user_id === user.id,
    );
    return json(res, 200, rows);
  }

  if (pathname === "/rest/v1/document_template_favorites" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const row = { ...body, user_id: user.id, created_at: new Date().toISOString() };
    const key = `${row.user_id}:${row.template_key}`;
    getOrCreateOrgMap(documentFavoritesByOrg, body.organization_id).set(key, row);
    return json(res, 201, wantsSingleObject(req) ? row : [row]);
  }

  if (pathname === "/rest/v1/document_template_favorites" && req.method === "DELETE") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    const templateKey = parseEqFilter(searchParams.get("template_key"));
    const table = documentFavoritesByOrg.get(organizationId);
    if (table) table.delete(`${user.id}:${templateKey}`);
    return json(res, 204, null);
  }

  if (pathname === "/rest/v1/document_delivery" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const documentId = parseEqFilter(searchParams.get("document_id"));
    const rows = [];
    for (const table of documentDeliveryByOrg.values()) {
      for (const row of table.values()) {
        if (row.document_id === documentId) rows.push(row);
      }
    }
    return json(res, 200, rows);
  }

  if (pathname === "/rest/v1/document_delivery" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const row = { id: randomUUID(), created_at: new Date().toISOString(), created_by: user.id, ...body };
    getOrCreateOrgMap(documentDeliveryByOrg, body.organization_id).set(row.id, row);
    return json(res, 201, wantsSingleObject(req) ? row : [row]);
  }

  if (pathname === "/rest/v1/document_external_signature_metadata" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    return json(res, 200, []);
  }

  if (pathname === "/rest/v1/document_external_signature_metadata" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const row = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      registered_at: new Date().toISOString(),
      created_by: user.id,
      ...body,
    };
    return json(res, 201, wantsSingleObject(req) ? row : [row]);
  }

  if (pathname === "/rest/v1/patient_attachments" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    const role = organizationId ? membershipRole(user.id, organizationId) : null;
    if (!organizationId || !role) return json(res, 200, []);
    const rows = applyOrder(
      [...(patientAttachmentsByOrg.get(organizationId)?.values() ?? [])].filter(
        (row) => matchesFilters(row, searchParams) && isSensitivityVisible(role, row.sensitivity),
      ),
      searchParams,
    );
    return json(res, 200, rows);
  }

  if (pathname === "/rest/v1/patient_attachments" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const role = membershipRole(user.id, body.organization_id);
    if (!role || !isSensitivityVisible(role, body.sensitivity)) {
      return json(res, 403, { message: "row-level security policy violation" });
    }
    const row = {
      id: randomUUID(),
      organization_id: body.organization_id,
      patient_id: body.patient_id,
      sensitivity: body.sensitivity,
      title: body.title,
      storage_path: body.storage_path,
      mime_type: body.mime_type,
      byte_size: body.byte_size,
      sha256: body.sha256,
      uploaded_by: user.id,
      created_at: new Date().toISOString(),
    };
    getOrCreateOrgMap(patientAttachmentsByOrg, body.organization_id).set(row.id, row);
    return json(res, 201, wantsSingleObject(req) ? row : [row]);
  }

  if (pathname === "/rest/v1/patient_attachments" && req.method === "DELETE") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const idFilter = parseEqFilter(searchParams.get("id"));
    for (const table of patientAttachmentsByOrg.values()) {
      if (table.has(idFilter)) {
        table.delete(idFilter);
        break;
      }
    }
    return json(res, 200, []);
  }

  if (pathname === "/rest/v1/consent_files" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const consentIdFilter = parseEqFilter(searchParams.get("consent_id"));
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    let rows = [];
    for (const [orgId, table] of consentFilesByOrg.entries()) {
      const role = membershipRole(user.id, orgId);
      if (!role) continue;
      for (const row of table.values()) {
        if (consentIdFilter && row.consent_id !== consentIdFilter) continue;
        if (organizationId && row.organization_id !== organizationId) continue;
        // Mirrors the consent_files_select policy: admin sees all, others
        // only administrative-type consents.
        const consent = [...consentsByOrg.get(orgId)?.values() ?? []].find(
          (c) => c.id === row.consent_id,
        );
        const isAdministrative = consent && ADMINISTRATIVE_CONSENT_TYPES.has(consent.type);
        if (role === "psychologist_admin" || isAdministrative) {
          rows.push(row);
        }
      }
    }
    rows = applyOrder(rows, searchParams);
    if (wantsSingleObject(req)) {
      if (rows.length !== 1) {
        return json(res, 406, {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
          details: rows.length === 0 ? "Results contain 0 rows" : "Results contain multiple rows",
        });
      }
      return json(res, 200, rows[0]);
    }
    return json(res, 200, rows);
  }

  if (pathname === "/rest/v1/consent_files" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    if (membershipRole(user.id, body.organization_id) !== "psychologist_admin") {
      return json(res, 403, { message: "row-level security policy violation" });
    }
    const row = { id: randomUUID(), generated_at: new Date().toISOString(), ...body };
    getOrCreateOrgMap(consentFilesByOrg, body.organization_id).set(row.id, row);
    return json(res, 201, wantsSingleObject(req) ? row : [row]);
  }

  if (pathname === "/rest/v1/rpc/secretary_finance_access" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    json(res, 200, financeAccess(user.id, body.org_id));
    return;
  }

  if (pathname === "/rest/v1/rpc/create_session_charge" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    if (!canWriteFinance(user.id, body.org_id)) {
      json(res, 403, { message: "not authorized to write finance", code: "42501" });
      return;
    }
    const session = clinicalSessionsByOrg.get(body.org_id)?.get(body.p_session_id);
    if (!session) {
      json(res, 200, null);
      return;
    }
    const existing = [...(financialChargesByOrg.get(body.org_id)?.values() ?? [])].find(
      (row) => row.session_id === body.p_session_id,
    );
    if (existing) {
      json(res, 200, existing.id);
      return;
    }
    const consumed = [...(financialPlanMovementsByOrg.get(body.org_id)?.values() ?? [])].find(
      (row) => row.session_id === body.p_session_id && row.movement === "consume",
    );
    if (consumed) {
      json(res, 200, null);
      return;
    }
    const activePlan = [...(financialPlansByOrg.get(body.org_id)?.values() ?? [])].find(
      (row) => row.patient_id === session.patient_id && row.status === "active",
    );
    if (activePlan && (activePlan.plan_type === "prepaid_package" || activePlan.plan_type === "postpaid_package")) {
      const remaining =
        activePlan.total_sessions == null ? Infinity : activePlan.total_sessions - activePlan.used_sessions;
      if (remaining > 0) {
        const movement = {
          id: randomUUID(),
          organization_id: body.org_id,
          plan_id: activePlan.id,
          session_id: body.p_session_id,
          movement: "consume",
          delta: 1,
          reason: "Consumo na finalização da sessão",
          created_by: user.id,
          created_at: new Date().toISOString(),
        };
        getOrCreateOrgMap(financialPlanMovementsByOrg, body.org_id).set(movement.id, movement);
        activePlan.used_sessions += 1;
        json(res, 200, null);
        return;
      }
    }
    if (activePlan?.plan_type === "monthly") {
      json(res, 200, null);
      return;
    }
    const patient = patientsByOrg.get(body.org_id)?.get(session.patient_id);
    const fee = patient?.default_session_value;
    if (fee == null || Number(fee) <= 0) {
      json(res, 200, null);
      return;
    }
    const competence = (session.started_at ?? new Date().toISOString()).slice(0, 10);
    const charge = {
      id: randomUUID(),
      organization_id: body.org_id,
      patient_id: session.patient_id,
      session_id: body.p_session_id,
      plan_id: null,
      origin: "session",
      description: "Sessão clínica",
      amount: fee,
      due_date: competence,
      competence_date: competence,
      status: "pending",
      canceled_at: null,
      canceled_by: null,
      cancel_reason: null,
      nfse_requested_at: null,
      idempotency_key: null,
      created_by: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    getOrCreateOrgMap(financialChargesByOrg, body.org_id).set(charge.id, charge);
    json(res, 200, charge.id);
    return;
  }

  if (pathname === "/rest/v1/practice_settings" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    if (!organizationId || membershipRole(user.id, organizationId) !== "psychologist_admin") {
      return json(res, 200, wantsSingleObject(req) ? null : []);
    }
    const row = practiceSettingsByOrg.get(organizationId) ?? defaultPracticeSettings(organizationId);
    return json(res, 200, wantsSingleObject(req) ? row : [row]);
  }

  if (pathname === "/rest/v1/practice_settings" && (req.method === "PATCH" || req.method === "PUT")) {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });
    const organizationId = parseEqFilter(searchParams.get("organization_id"));
    if (!organizationId || membershipRole(user.id, organizationId) !== "psychologist_admin") {
      return json(res, 403, { message: "row-level security policy violation" });
    }
    const current = practiceSettingsByOrg.get(organizationId) ?? defaultPracticeSettings(organizationId);
    const next = { ...current, ...body, organization_id: organizationId };
    practiceSettingsByOrg.set(organizationId, next);
    return json(res, 200, wantsSingleObject(req) ? next : [next]);
  }

  const financeTables = {
    "/rest/v1/financial_charges": financialChargesByOrg,
    "/rest/v1/financial_payments": financialPaymentsByOrg,
    "/rest/v1/financial_expenses": financialExpensesByOrg,
    "/rest/v1/financial_plans": financialPlansByOrg,
    "/rest/v1/financial_plan_movements": financialPlanMovementsByOrg,
    "/rest/v1/financial_closings": financialClosingsByOrg,
  };
  const financeTable = financeTables[pathname];
  if (financeTable) {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });

    if (req.method === "GET") {
      const idFilter = parseEqFilter(searchParams.get("id"));
      const organizationId = parseEqFilter(searchParams.get("organization_id"));
      let rows = idFilter
        ? (() => {
            const row = findFinanceRow(financeTable, user.id, (item) => item.id === idFilter);
            return row ? [row] : [];
          })()
        : listFinanceRows(financeTable, user.id, organizationId).filter((row) =>
            matchesFilters(row, searchParams),
          );
      rows = applyOrder(rows, searchParams);
      if (wantsSingleObject(req)) {
        if (rows.length !== 1) {
          return json(res, 406, {
            code: "PGRST116",
            message: "JSON object requested, multiple (or no) rows returned",
          });
        }
        return json(res, 200, rows[0]);
      }
      return json(res, 200, applyLimit(rows, searchParams));
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      if (!canWriteFinance(user.id, body.organization_id)) {
        return json(res, 403, { message: "row-level security policy violation" });
      }
      const competence =
        body.competence_date ??
        body.due_date ??
        (body.charge_id
          ? [...(financialChargesByOrg.get(body.organization_id)?.values() ?? [])].find(
              (item) => item.id === body.charge_id,
            )?.competence_date
          : todaySaoPauloDateStr());
      if (periodClosed(body.organization_id, competence)) {
        return json(res, 400, { message: "financial period is closed for this competence date", code: "P0001" });
      }
      if (pathname === "/rest/v1/financial_payments") {
        const charge = [...(financialChargesByOrg.get(body.organization_id)?.values() ?? [])].find(
          (item) => item.id === body.charge_id,
        );
        if (!charge) return json(res, 403, { message: "row-level security policy violation" });
        let paid = 0;
        for (const payment of financialPaymentsByOrg.get(body.organization_id)?.values() ?? []) {
          if (payment.charge_id === charge.id && !payment.voided_at) paid += Number(payment.amount);
        }
        if (paid + Number(body.amount) > Number(charge.amount) + 1e-9) {
          return json(res, 400, { message: "payment exceeds remaining charge amount", code: "P0001" });
        }
        const key = body.idempotency_key;
        if (key) {
          const duplicate = [...(financialPaymentsByOrg.get(body.organization_id)?.values() ?? [])].find(
            (item) => item.idempotency_key === key,
          );
          if (duplicate) {
            return json(res, 409, { message: "duplicate key value violates unique constraint" });
          }
        }
      }
      if (pathname === "/rest/v1/financial_charges" && body.session_id) {
        const duplicate = [...(financialChargesByOrg.get(body.organization_id)?.values() ?? [])].find(
          (item) => item.session_id === body.session_id,
        );
        if (duplicate) {
          return json(res, 409, { message: "duplicate key value violates unique constraint" });
        }
      }
      const now = new Date().toISOString();
      const row = {
        id: randomUUID(),
        status:
          pathname === "/rest/v1/financial_charges"
            ? "pending"
            : pathname === "/rest/v1/financial_expenses"
              ? "pending"
              : pathname === "/rest/v1/financial_plans"
                ? "active"
                : pathname === "/rest/v1/financial_closings"
                  ? body.status ?? "closed"
                  : undefined,
        used_sessions: pathname === "/rest/v1/financial_plans" ? 0 : undefined,
        created_at: now,
        updated_at: now,
        voided_at: null,
        canceled_at: null,
        nfse_requested_at: null,
        paid_at: body.paid_at ?? (pathname === "/rest/v1/financial_payments" ? now : null),
        registered_by: pathname === "/rest/v1/financial_payments" ? user.id : null,
        created_by: user.id,
        totals_snapshot: body.totals_snapshot ?? {},
        ...body,
      };
      if (pathname === "/rest/v1/financial_charges" && row.due_date && row.due_date < todaySaoPauloDateStr() && row.status === "pending") {
        row.status = "overdue";
      }
      getOrCreateOrgMap(financeTable, body.organization_id).set(row.id, row);
      if (pathname === "/rest/v1/financial_payments") {
        const charge = [...(financialChargesByOrg.get(body.organization_id)?.values() ?? [])].find(
          (item) => item.id === body.charge_id,
        );
        if (charge) refreshChargeStatus(charge);
      }
      if (pathname === "/rest/v1/financial_plan_movements") {
        const plan = financialPlansByOrg.get(body.organization_id)?.get(body.plan_id);
        if (plan) {
          plan.used_sessions = [...(financialPlanMovementsByOrg.get(body.organization_id)?.values() ?? [])]
            .filter((item) => item.plan_id === plan.id)
            .reduce((sum, item) => sum + Number(item.delta), 0);
        }
      }
      return json(res, 201, wantsSingleObject(req) ? row : [row]);
    }

    if (req.method === "PATCH" || req.method === "PUT") {
      const body = await readBody(req);
      const idFilter = parseEqFilter(searchParams.get("id"));
      const row = findFinanceRow(financeTable, user.id, (item) => item.id === idFilter);
      if (!row || !canWriteFinance(user.id, row.organization_id)) {
        return json(res, 200, wantsSingleObject(req) ? null : []);
      }
      if (periodClosed(row.organization_id, row.competence_date ?? row.due_date ?? row.period_start)) {
        if (pathname !== "/rest/v1/financial_closings") {
          return json(res, 400, { message: "financial period is closed for this competence date", code: "P0001" });
        }
      }
      Object.assign(row, body, { id: row.id, organization_id: row.organization_id, updated_at: new Date().toISOString() });
      if (pathname === "/rest/v1/financial_payments") refreshChargeStatus(
        [...(financialChargesByOrg.get(row.organization_id)?.values() ?? [])].find((item) => item.id === row.charge_id) ?? { status: "pending" },
      );
      return json(res, 200, wantsSingleObject(req) ? row : [row]);
    }

    if (req.method === "DELETE") {
      return json(res, 403, { message: "permission denied for table" });
    }
  }

  if (pathname === "/rest/v1/logical_exports") {
    const user = bearerUser(req);
    if (!user) return json(res, 401, { message: "invalid JWT" });

    if (req.method === "GET") {
      const organizationId = parseEqFilter(searchParams.get("organization_id"));
      const idFilter = parseEqFilter(searchParams.get("id"));
      if (idFilter) {
        for (const [orgId, table] of logicalExportsByOrg.entries()) {
          if (membershipRole(user.id, orgId) !== "psychologist_admin") continue;
          const row = table.get(idFilter);
          if (row) {
            return json(res, 200, wantsSingleObject(req) ? row : [row]);
          }
        }
        return json(res, 200, wantsSingleObject(req) ? null : []);
      }
      if (!organizationId || membershipRole(user.id, organizationId) !== "psychologist_admin") {
        return json(res, 200, []);
      }
      const rows = applyOrder(
        [...(logicalExportsByOrg.get(organizationId)?.values() ?? [])],
        searchParams,
      );
      return json(res, 200, applyLimit(rows, searchParams));
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      if (membershipRole(user.id, body.organization_id) !== "psychologist_admin") {
        return json(res, 403, { message: "row-level security policy violation" });
      }
      const now = new Date().toISOString();
      const row = {
        id: randomUUID(),
        organization_id: body.organization_id,
        actor_user_id: user.id,
        scope: body.scope,
        patient_id: body.patient_id ?? null,
        schema_version: body.schema_version ?? "tesseli-export-v1",
        status: body.status ?? "queued",
        storage_path: null,
        package_bytes: null,
        file_count: null,
        package_sha256: null,
        manifest_sha256: null,
        error_code: null,
        requested_at: now,
        ready_at: null,
        expires_at: null,
        created_at: now,
        updated_at: now,
      };
      getOrCreateOrgMap(logicalExportsByOrg, body.organization_id).set(row.id, row);
      return json(res, 201, wantsSingleObject(req) ? row : [row]);
    }

    if (req.method === "PATCH" || req.method === "PUT") {
      const body = await readBody(req);
      const idFilter = parseEqFilter(searchParams.get("id"));
      let updated = null;
      for (const [orgId, table] of logicalExportsByOrg.entries()) {
        if (membershipRole(user.id, orgId) !== "psychologist_admin") continue;
        if (idFilter && table.has(idFilter)) {
          const current = table.get(idFilter);
          updated = {
            ...current,
            ...body,
            id: current.id,
            organization_id: current.organization_id,
            actor_user_id: current.actor_user_id,
            updated_at: new Date().toISOString(),
          };
          table.set(idFilter, updated);
          break;
        }
      }
      if (!updated) {
        return json(res, 200, wantsSingleObject(req) ? null : []);
      }
      return json(res, 200, wantsSingleObject(req) ? updated : [updated]);
    }
  }

  json(res, 404, { msg: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[auth-stub] listening on http://127.0.0.1:${PORT}`);
});
