// Minimal Supabase Auth REST API stub used only for deterministic Playwright
// E2E coverage of the login/shell/lock UI flows in environments without a
// live Supabase project (no Docker/local Supabase available). It is never
// used by application code and proves nothing about RLS/JWT security -
// those adversarial checks run against a real Supabase project in the
// Phase 2 gate.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.AUTH_STUB_PORT ?? 54331);

const TEST_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "psicologa@serenapsi.test",
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
  phone: "",
  confirmed_at: "2026-01-01T00:00:00.000Z",
  last_sign_in_at: new Date().toISOString(),
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { full_name: "Ana Serena" },
  identities: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const TEST_PASSWORD = "SerenaPsi#2026";

/** @type {Map<string, typeof TEST_USER>} */
const tokensToUser = new Map();

function json(res, status, body) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "*",
  });
  res.end(payload);
}

function issueSession(user) {
  const accessToken = `test-access-${randomUUID()}`;
  const refreshToken = `test-refresh-${randomUUID()}`;
  tokensToUser.set(accessToken, user);
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 14400,
    refresh_token: refreshToken,
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

function bearerToken(req) {
  const header = req.headers["authorization"];
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length);
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "*",
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const { pathname, searchParams } = url;

  if (pathname === "/health" && req.method === "GET") {
    json(res, 200, { ok: true });
    return;
  }

  if (pathname === "/auth/v1/token" && req.method === "POST") {
    const grantType = searchParams.get("grant_type");
    const body = await readBody(req);

    if (grantType === "password") {
      if (body.email === TEST_USER.email && body.password === TEST_PASSWORD) {
        json(res, 200, issueSession(TEST_USER));
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
      json(res, 200, issueSession(TEST_USER));
      return;
    }

    json(res, 400, { msg: "Unsupported grant_type", error_code: "unsupported_grant_type" });
    return;
  }

  if (pathname === "/auth/v1/user" && req.method === "GET") {
    const token = bearerToken(req);
    const user = token ? tokensToUser.get(token) : null;
    if (!user) {
      json(res, 401, { msg: "invalid JWT", error_code: "bad_jwt" });
      return;
    }
    json(res, 200, user);
    return;
  }

  if (pathname === "/auth/v1/user" && req.method === "PUT") {
    const token = bearerToken(req);
    const user = token ? tokensToUser.get(token) : null;
    if (!user) {
      json(res, 401, { msg: "invalid JWT", error_code: "bad_jwt" });
      return;
    }
    json(res, 200, user);
    return;
  }

  if (pathname === "/auth/v1/logout" && req.method === "POST") {
    const token = bearerToken(req);
    if (token) {
      tokensToUser.delete(token);
    }
    res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
    res.end();
    return;
  }

  if (pathname === "/auth/v1/recover" && req.method === "POST") {
    json(res, 200, {});
    return;
  }

  json(res, 404, { msg: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[auth-stub] listening on http://127.0.0.1:${PORT}`);
});
