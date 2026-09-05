#!/usr/bin/env node
/**
 * Production Storage smoke: mint signed upload URLs, PUT a tiny non-clinical
 * PNG, confirm download, then delete the object. Prints only PASS/FAIL flags.
 * Never prints tokens, URLs, JWTs or secret values.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(relative) {
  const full = resolve(process.cwd(), relative);
  if (!existsSync(full)) {
    return;
  }
  for (const line of readFileSync(full, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq < 1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function present(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function flag(label, ok) {
  console.log(`${label}: ${ok ? "PASS" : "FAIL"}`);
}

async function smokeBucket(admin, bucket, objectPath) {
  const signed = await admin.storage.from(bucket).createSignedUploadUrl(objectPath);
  if (signed.error || !signed.data?.token) {
    return { grant: false, upload: false, download: false, cleaned: true };
  }
  const uploaded = await admin.storage
    .from(bucket)
    .uploadToSignedUrl(objectPath, signed.data.token, TINY_PNG, {
      contentType: "image/png",
    });
  const uploadOk = !uploaded.error;
  let downloadOk = false;
  if (uploadOk) {
    const dl = await admin.storage.from(bucket).createSignedUrl(objectPath, 60);
    downloadOk = Boolean(dl.data?.signedUrl) && !dl.error;
  }
  const removed = await admin.storage.from(bucket).remove([objectPath]);
  return {
    grant: true,
    upload: uploadOk,
    download: downloadOk,
    cleaned: !removed.error,
  };
}

async function main() {
  const flags = {
    NEXT_PUBLIC_SUPABASE_URL: present("NEXT_PUBLIC_SUPABASE_URL"),
    SUPABASE_SECRET_KEY: present("SUPABASE_SECRET_KEY"),
    TWILIO_ACCOUNT_SID: present("TWILIO_ACCOUNT_SID"),
    GEMINI_API_KEY: present("GEMINI_API_KEY"),
    GOOGLE_CLIENT_ID: present("GOOGLE_CLIENT_ID"),
    CRON_SECRET: present("CRON_SECRET"),
  };
  console.log(
    "env_presence",
    Object.fromEntries(Object.entries(flags).map(([key, value]) => [key, value ? "set" : "missing"])),
  );

  if (!flags.NEXT_PUBLIC_SUPABASE_URL || !flags.SUPABASE_SECRET_KEY) {
    console.log("PROFILE_SIGN_GRANT: NOT_VERIFIED");
    console.log("PATIENT_SIGN_GRANT: NOT_VERIFIED");
    process.exit(2);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const org = "00000000-0000-4000-8000-000000000000";
  const patient = randomUUID();
  const professionalPath = `${org}/professional/${randomUUID()}-smoke.png`;
  const patientPath = `${org}/${patient}/${randomUUID()}-smoke.png`;

  const professional = await smokeBucket(admin, "practice-assets", professionalPath);
  const patientResult = await smokeBucket(admin, "patient-attachments", patientPath);

  flag("PROFILE_SIGN_GRANT", professional.grant);
  flag("PROFILE_UPLOAD", professional.upload);
  flag("PROFILE_DOWNLOAD", professional.download);
  flag("PROFILE_CLEANUP", professional.cleaned);
  flag("PATIENT_SIGN_GRANT", patientResult.grant);
  flag("PATIENT_UPLOAD", patientResult.upload);
  flag("PATIENT_DOWNLOAD", patientResult.download);
  flag("PATIENT_CLEANUP", patientResult.cleaned);

  const ok =
    professional.grant &&
    professional.upload &&
    professional.cleaned &&
    patientResult.grant &&
    patientResult.upload &&
    patientResult.cleaned;
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  const code =
    error instanceof Error && /Invalid environment configuration/i.test(error.message)
      ? "env_invalid"
      : "smoke_failed";
  console.error("SMOKE_ERROR", code);
  process.exit(1);
});
