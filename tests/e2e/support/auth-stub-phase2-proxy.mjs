import { createServer } from "node:http";
import { spawn } from "node:child_process";

const FRONT_PORT = Number(process.env.AUTH_STUB_PORT ?? 54331);
const BACKEND_PORT = FRONT_PORT + 1;
const BACKEND_ORIGIN = `http://127.0.0.1:${BACKEND_PORT}`;

const child = spawn(process.execPath, ["tests/e2e/support/auth-stub-server.mjs"], {
  env: { ...process.env, AUTH_STUB_PORT: String(BACKEND_PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout?.pipe(process.stdout);
child.stderr?.pipe(process.stderr);

let preferGoogleNextSession = false;

function translatedPath(pathname) {
  if (pathname === "/rest/v1/financial_charges_effective") {
    return "/rest/v1/financial_charges";
  }
  if (pathname === "/rest/v1/financial_expenses_effective") {
    return "/rest/v1/financial_expenses";
  }
  return pathname;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function observeControlHook(pathname, method, body) {
  if (pathname !== "/e2e/google-connection" || method !== "POST" || !body?.length) {
    return;
  }
  try {
    const parsed = JSON.parse(body.toString("utf8"));
    preferGoogleNextSession =
      parsed?.status === "connected" && parsed?.nextSession === "google";
  } catch {
    preferGoogleNextSession = false;
  }
}

function stabilizeGoogleNextSession(pathname, payload, contentType) {
  if (
    !preferGoogleNextSession ||
    pathname !== "/rest/v1/appointments" ||
    !contentType.includes("application/json")
  ) {
    return payload;
  }

  let rows;
  try {
    rows = JSON.parse(payload.toString("utf8"));
  } catch {
    return payload;
  }

  if (!Array.isArray(rows)) return payload;
  const googleIndex = rows.findIndex((row) => row?.google_event_id === "external-evt-1");
  if (googleIndex <= 0) return payload;

  // The backend stub deliberately keeps today's fixtures inside the current
  // São Paulo civil day. Near midnight that clamp can collapse multiple future
  // starts to almost the same instant. Only when the test explicitly requests
  // `nextSession: "google"` do we make that intended fixture ordering stable.
  const [google] = rows.splice(googleIndex, 1);
  rows.unshift(google);
  return Buffer.from(JSON.stringify(rows));
}

const server = createServer(async (req, res) => {
  try {
    const incoming = new URL(req.url ?? "/", `http://127.0.0.1:${FRONT_PORT}`);
    incoming.pathname = translatedPath(incoming.pathname);

    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        for (const item of value) headers.append(name, item);
      } else {
        headers.set(name, value);
      }
    }
    headers.delete("host");
    headers.delete("content-length");

    const method = req.method ?? "GET";
    const body = method === "GET" || method === "HEAD" ? undefined : await readRequestBody(req);
    observeControlHook(incoming.pathname, method, body);

    const upstream = await fetch(`${BACKEND_ORIGIN}${incoming.pathname}${incoming.search}`, {
      method,
      headers,
      body: body && body.length > 0 ? body : undefined,
    });

    const responseHeaders = {};
    upstream.headers.forEach((value, name) => {
      responseHeaders[name] = value;
    });
    const rawPayload = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get("content-type") ?? "";
    const payload = stabilizeGoogleNextSession(incoming.pathname, rawPayload, contentType);
    if (payload.length !== rawPayload.length) {
      delete responseHeaders["content-length"];
    }
    res.writeHead(upstream.status, responseHeaders);
    res.end(payload);
  } catch (error) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "E2E auth stub proxy failure", detail: String(error) }));
  }
});

server.listen(FRONT_PORT, "127.0.0.1");

function shutdown(signal) {
  server.close(() => {
    if (!child.killed) child.kill(signal);
    process.exit(0);
  });
  setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
    process.exit(0);
  }, 2_000).unref();
}

child.on("exit", (code, signal) => {
  if (code !== 0 && signal == null) {
    console.error(`auth stub backend exited with code ${code}`);
  }
  server.close(() => process.exit(code ?? 0));
});

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
