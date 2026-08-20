---
name: bootstrap-tesseli
description: Initialize the Tesseli repository with the required application foundation, tooling and architecture checks.
disable-model-invocation: true
---
# Bootstrap Tesseli

Use only for Phase 0.

1. Read `MASTER_PROMPT.md`, `docs/03-architecture.md`, `docs/09-env-contract.md` and all always-on rules.
2. Create the Next.js TypeScript app in the current repository, not a nested accidental repo.
3. Configure pnpm, lint, typecheck, Vitest, Playwright and Supabase CLI.
4. Create the feature-oriented directories from the master prompt.
5. Add env schema without real secrets.
6. Add CI for install/lint/typecheck/test/build.
7. Scan for forbidden architecture dependencies: Firebase/Firestore, parallel Express/Nest backends and duplicated ORM schema ownership.
8. Run the baseline gate and stop.

Do not implement product features.
