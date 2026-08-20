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

const PASSWORD = "SerenaPsi#2026";

// Seeded accounts, one per tenancy scenario the E2E suite needs.
const ADMIN = makeUser("psicologa@serenapsi.test", "Ana Serena");
const NEWCOMER = makeUser("nova@serenapsi.test", "Nova Profissional");
const MULTI = makeUser("multi@serenapsi.test", "Marina Multi");
const SECRETARY = makeUser("secretaria@serenapsi.test", "Sara Secretaria");

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
  phone: "11988887777",
  email: "beatriz@example.com",
});
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
      // Emails shaped like `novo-<id>@serenapsi.test` are created on demand
      // with zero memberships, so each onboarding test gets an isolated user
      // instead of sharing mutable state across projects.
      if (
        !usersByEmail.has(body.email) &&
        /^novo-[a-z0-9-]+@serenapsi\.test$/.test(body.email ?? "")
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

  if (pathname === "/rest/v1/rpc/log_audit_event" && req.method === "POST") {
    const user = bearerUser(req);
    if (!user) {
      json(res, 401, { message: "invalid JWT" });
      return;
    }
    json(res, 200, randomUUID());
    return;
  }

  json(res, 404, { msg: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[auth-stub] listening on http://127.0.0.1:${PORT}`);
});
