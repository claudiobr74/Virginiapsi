# SerenaPsi Project Instructions

`docs/` is the product and technical source of truth, `src/lib/ai/prompts/**` is the source of truth for runtime AI behavior, and `.cursor/rules/` contains persistent enforcement for the SerenaPsi codebase.

Always:
- complete the pre-implementation audit before Phase 0 and require final verdict `READY` after the v1.4 corrections;
- keep one Next.js + Supabase architecture;
- implement the SerenaPsi visual identity faithfully;
- protect clinical data by RLS/RBAC;
- separate Google Calendar OAuth from app login;
- use Supabase Cron + Twilio outbox for 24h/2h reminders; use Deepgram/Gemini with server-safe patterns;
- preserve approved Session/Supervisor/Knowledge runtime prompts and their evidence boundaries;
- verify work before declaring completion;
- keep dependencies and backend boundaries consistent with the architecture specification.

## Pre-implementation

Use `preimplementation-auditor` with `CLAUDE_PRE_IMPLEMENTATION_REVIEW_PROMPT.md` before any implementation. It is read-only and must stop after producing the audit verdict.

## Delegation

Use `docs/13-agent-orchestration.md`. Do not invoke all subagents by default; choose the smallest relevant specialist set and always finish accepted phases with `verifier`.

## Cursor Cloud specific instructions

Node 22 and pnpm 10 are preinstalled; the startup update script runs `pnpm install`. Standard commands live in `package.json` `scripts` and the README "Execução local" section — use those rather than reinventing them (`pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm gate`, `pnpm test:e2e`).

Non-obvious caveats for running/testing here:

- `.env.local` is gitignored and is NOT recreated by the update script, so it is absent on a fresh VM. Create it before `pnpm dev`/`pnpm build` (both boot-validate the public env via Zod and fail loudly if it is missing). The three placeholder public vars from `.env.example` are enough to boot: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (must start with `sb_publishable_`), `NEXT_PUBLIC_APP_URL`. `pnpm lint`/`pnpm typecheck`/`pnpm test` do not need it.
- There is no real Supabase in this environment (local Supabase needs Docker, which is not installed) and there are no product migrations yet (Phase 2). To exercise the real login → shell flow in a browser without Docker, run the repo's Supabase Auth stub and point the dev server at it: start `node tests/e2e/support/auth-stub-server.mjs` (listens on `:54331`), then run `pnpm dev` with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54331` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local_dev` (inline env overrides `.env.local`). Stub credentials are `psicologa@serenapsi.test` / `SerenaPsi#2026`. The stub proves navigation/gate flows only, never RLS/JWT security.
- `pnpm test:e2e` is self-contained: `playwright.config.ts` auto-starts both the auth stub and the dev server, so do not start them yourself first. It requires Playwright browsers, which are not part of `pnpm install`; install them on demand with `pnpm exec playwright install --with-deps chromium`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
