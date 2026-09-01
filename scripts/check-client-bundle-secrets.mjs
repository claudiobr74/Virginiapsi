#!/usr/bin/env node
// docs/09-env-contract.md: "criar teste que procura secrets conhecidos no
// client build quando possível." Scans the production client bundle for the
// names of server-only env vars. Run after `next build`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CLIENT_DIR = path.join(ROOT, ".next", "static");

const FORBIDDEN_NAMES = [
  "SUPABASE_SECRET_KEY",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_TOKEN_ENCRYPTION_KEY",
  "SESSION_CAPTURE_SECRET",
  "TWILIO_AUTH_TOKEN",
  "GROQ_API_KEY",
  "GROQ_TRANSCRIPTION_MODEL",
  "GROQ_TRANSCRIPTION_TIMEOUT_MS",
  "GEMINI_API_KEY",
  "CRON_SECRET",
];

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
    } else if (entry.endsWith(".js")) {
      acc.push(full);
    }
  }
  return acc;
}

if (!statSync(CLIENT_DIR, { throwIfNoEntry: false })) {
  console.error(
    `[check-client-bundle-secrets] ${CLIENT_DIR} not found. Run "pnpm build" first.`,
  );
  process.exit(1);
}

const files = walk(CLIENT_DIR);
const hits = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const name of FORBIDDEN_NAMES) {
    if (source.includes(name)) {
      hits.push(`${path.relative(ROOT, file)} contains "${name}"`);
    }
  }
}

if (hits.length > 0) {
  console.error("[check-client-bundle-secrets] FAIL");
  for (const hit of hits) {
    console.error(`  - ${hit}`);
  }
  process.exit(1);
}

console.log(
  `[check-client-bundle-secrets] PASS — scanned ${files.length} client chunk(s), no server-only env names found.`,
);
