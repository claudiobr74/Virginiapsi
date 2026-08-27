import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const ROOT = path.resolve(__dirname, "../../..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase/migrations");
const EMULATION_SQL = path.join(__dirname, "supabase-emulation.sql");

/** Superuser connection: applies migrations and seeds auth.users. */
export const ADMIN_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://tesseli_admin:tesseli@127.0.0.1:5432/tesseli_test";

const APP_ROLE_PASSWORD = process.env.TEST_APP_ROLE_PASSWORD ?? "tesseli";
const APP_ROLE_NAME = "tesseli_authenticator";

/**
 * Connection used by the tests to impersonate PostgREST: a non-superuser,
 * non-owner login role that only switches into anon/authenticated/service_role.
 * Superusers and table owners bypass RLS, so tests must never use ADMIN_URL to
 * assert a policy.
 */
export function appUrl(): string {
  const url = new URL(ADMIN_URL);
  url.username = APP_ROLE_NAME;
  url.password = APP_ROLE_PASSWORD;
  return url.toString();
}

async function withAdmin<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Superuser helper for test setup/teardown only — never to assert RLS. */
export async function runAsAdmin<T>(
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  return withAdmin(fn);
}

async function ensureApiRoles(client: Client) {
  await client.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
      end if;
      if not exists (select 1 from pg_roles where rolname = '${APP_ROLE_NAME}') then
        create role ${APP_ROLE_NAME} login password '${APP_ROLE_PASSWORD}' noinherit;
      end if;
    end $$;
  `);
  await client.query(
    `grant anon, authenticated, service_role to ${APP_ROLE_NAME};`,
  );
  await client.query(
    `grant connect on database ${JSON.stringify(new URL(ADMIN_URL).pathname.slice(1)).replaceAll('"', "")} to ${APP_ROLE_NAME};`,
  );
}

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

/** Recreates the schema from scratch and applies every migration in order. */
export async function resetDatabase(): Promise<void> {
  await withAdmin(async (client) => {
    await ensureApiRoles(client);
    await client.query("drop schema if exists public cascade;");
    await client.query("drop schema if exists auth cascade;");
    await client.query("create schema public;");
    await client.query(readFileSync(EMULATION_SQL, "utf8"));

    for (const file of migrationFiles()) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      try {
        await client.query(sql);
      } catch (error) {
        throw new Error(
          `migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  });
}

export async function createAuthUser(
  email?: string,
  options: { emailConfirmed?: boolean } = {},
): Promise<string> {
  const id = randomUUID();
  const confirmedAt = options.emailConfirmed === false ? null : new Date().toISOString();
  await withAdmin(async (client) => {
    await client.query(
      "insert into auth.users (id, email, email_confirmed_at) values ($1, $2, $3)",
      [id, email ?? `${id}@tesseli.test`, confirmedAt],
    );
  });
  return id;
}

export interface SessionClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  expectError(sql: string, params?: unknown[]): Promise<string>;
  close(): Promise<void>;
}

interface SessionOptions {
  /** Authenticated user id; omit for an anonymous (role `anon`) session. */
  userId?: string;
  role?: "anon" | "authenticated" | "service_role";
}

/**
 * Opens a connection that behaves like a PostgREST request: it switches into
 * the API role and exposes the JWT claims exactly the way Supabase does after
 * the token signature has been verified. The claims are never trusted by the
 * policies themselves — they only carry the subject that auth.uid() resolves.
 */
export async function openSession(
  options: SessionOptions = {},
): Promise<SessionClient> {
  const role = options.role ?? (options.userId ? "authenticated" : "anon");
  const client = new Client({ connectionString: appUrl() });
  await client.connect();
  await client.query(`set role ${role};`);

  await client.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({
      role,
      ...(options.userId ? { sub: options.userId } : {}),
    }),
  ]);

  return {
    async query(sql, params) {
      const result = await client.query(sql, params);
      return result.rows;
    },
    async expectError(sql, params) {
      try {
        await client.query(sql, params);
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
      throw new Error(`expected statement to fail but it succeeded: ${sql}`);
    },
    async close() {
      await client.end();
    },
  };
}

/** Makes `userId` a platform operator using claim (if empty) or add (by an existing operator). */
export async function ensurePlatformOperator(userId: string): Promise<void> {
  const session = await openSession({ userId });
  try {
    await session.query("select public.claim_platform_operator()");
    const rows = await session.query<{ is_platform_operator: boolean }>(
      "select public.is_platform_operator() as is_platform_operator",
    );
    if (rows[0]?.is_platform_operator) {
      return;
    }
  } finally {
    await session.close();
  }

  const existing = await withAdmin(async (client) => {
    const result = await client.query<{ user_id: string }>(
      "select user_id from public.platform_operators limit 1",
    );
    return result.rows[0]?.user_id ?? null;
  });
  if (!existing) {
    throw new Error("failed to resolve a platform operator");
  }
  const operatorSession = await openSession({ userId: existing });
  try {
    await operatorSession.query("select public.add_platform_operator($1)", [userId]);
  } finally {
    await operatorSession.close();
  }
}

/** Creates an organization owned by `adminUserId` through the real RPC. */
export async function bootstrapOrganization(
  adminUserId: string,
  name = "Consultório Teste",
): Promise<string> {
  await ensurePlatformOperator(adminUserId);
  const session = await openSession({ userId: adminUserId });
  try {
    const slug = `org-${randomUUID().slice(0, 8)}`;
    const rows = await session.query<{ bootstrap_organization: string }>(
      "select public.bootstrap_organization($1, $2, $3) as bootstrap_organization",
      [name, slug, "Ana Serena"],
    );
    return rows[0].bootstrap_organization;
  } finally {
    await session.close();
  }
}

/** Adds a member using the admin's own session (exercises the real policy). */
export async function addMember(
  adminUserId: string,
  organizationId: string,
  memberUserId: string,
  role: "psychologist_admin" | "psychologist" | "secretary",
): Promise<void> {
  const session = await openSession({ userId: adminUserId });
  try {
    await session.query(
      "insert into public.organization_members (organization_id, user_id, role) values ($1, $2, $3)",
      [organizationId, memberUserId, role],
    );
  } finally {
    await session.close();
  }
}

export async function setSecretaryFinanceAccess(
  adminUserId: string,
  organizationId: string,
  value: "none" | "view" | "manage",
): Promise<void> {
  const session = await openSession({ userId: adminUserId });
  try {
    await session.query(
      "update public.practice_settings set secretary_finance_access = $2 where organization_id = $1",
      [organizationId, value],
    );
  } finally {
    await session.close();
  }
}
