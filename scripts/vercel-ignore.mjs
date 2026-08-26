#!/usr/bin/env node
/**
 * Ignored Build Step for Vercel.
 * Exit 0 = skip the build (no Hobby minutes, no Preview on prod Postgres).
 * Exit 1 = continue the build.
 *
 * Preview shares production Supabase keys (docs/09). Go-live G0/G2/G3 are
 * schema/docs PRs — deploying them was a D2 leak and burned Hobby builds.
 */
const env = process.env.VERCEL_ENV ?? "";
const ref = process.env.VERCEL_GIT_COMMIT_REF ?? "";

if (env === "production") {
  process.exit(1);
}

if (/^cursor\/go-live-g[023]/.test(ref)) {
  console.log(
    `skip Vercel Preview for ${ref}: go-live schema/docs must not share production Postgres (D2)`,
  );
  process.exit(0);
}

process.exit(1);
