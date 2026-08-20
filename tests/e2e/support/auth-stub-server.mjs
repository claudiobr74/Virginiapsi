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
  const list = memberships.get(userId) ?? [];
  list.push({ organization_id: id, role, active: true });
  memberships.set(userId, list);
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
memberships.set(SECRETARY.id, [
  { organization_id: ADMIN_ORG_ID, role: "secretary", active: true },
]);

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
    responsible_psychologist_user_id: null,
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

  if (pathname === "/auth/v1/user" && (req.method === "GET" || req.method === "PUT")) {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { msg: "invalid JWT", error_code: "bad_jwt" });
      return;
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

  if (pathname === "/rest/v1/organizations" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    const allowed = new Set(
      (memberships.get(user.id) ?? []).map((row) => row.organization_id),
    );
    const requested = parseInFilter(searchParams.get("id")) ?? [...allowed];
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
    json(res, 200, rows);
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
        professional_name: organization.professional_name,
        clinic_name: organization.clinic_name,
        inactivity_timeout_minutes: organization.inactivity_timeout_minutes,
        session_duration_minutes: organization.session_duration_minutes,
        greeting_prefix: null,
        quote: null,
      },
    ]);
    return;
  }

  if (pathname === "/rest/v1/rpc/bootstrap_organization" && req.method === "POST") {
    const user = bearerUser(req);
    const body = await readBody(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
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
      const isOrgMember = (memberships.get(user.id) ?? []).some(
        (m) => m.active && m.organization_id === orgId,
      );
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
    if (membershipRole(user.id, body.organization_id) !== "psychologist_admin") {
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
      if (
        membershipRole(user.id, orgId) === "psychologist_admin" &&
        table.has(idFilter)
      ) {
        const current = table.get(idFilter);
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
    if (membershipRole(user.id, body.org_id) !== "psychologist_admin") {
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
    const patientId = parseEqFilter(searchParams.get("patient_id"));

    let rows = [];
    if (idFilter) {
      const row = findAdminScopedRow(clinicalSessionsByOrg, user.id, (r) => r.id === idFilter);
      rows = row ? [row] : [];
    } else if (organizationId && membershipRole(user.id, organizationId) === "psychologist_admin") {
      rows = [...(clinicalSessionsByOrg.get(organizationId)?.values() ?? [])];
      if (patientId) {
        rows = rows.filter((row) => row.patient_id === patientId);
      }
      rows = applyOrder(rows, searchParams);
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

  json(res, 404, { msg: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[auth-stub] listening on http://127.0.0.1:${PORT}`);
});
