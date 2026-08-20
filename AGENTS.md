# Tesseli Project Instructions

`docs/` is the product and technical source of truth, `src/lib/ai/prompts/**` is the source of truth for runtime AI behavior, and `.cursor/rules/` contains persistent enforcement for the Tesseli codebase.

Always:
- complete the pre-implementation audit before Phase 0 and require final verdict `READY` after the v1.4 corrections;
- keep one Next.js + Supabase architecture;
- implement the Tesseli visual identity faithfully;
- protect clinical data by RLS/RBAC;
- separate Google Calendar OAuth from app login;
- use Supabase Cron + Twilio outbox for 24h/2h reminders; keep transcription on-device by default and use Gemini with server-safe patterns;
- preserve approved Session/Supervisor/Knowledge runtime prompts and their evidence boundaries;
- verify work before declaring completion;
- keep dependencies and backend boundaries consistent with the architecture specification.

## Pre-implementation

Use `preimplementation-auditor` with `CLAUDE_PRE_IMPLEMENTATION_REVIEW_PROMPT.md` before any implementation. It is read-only and must stop after producing the audit verdict.

## Delegation

Use `docs/13-agent-orchestration.md`. Do not invoke all subagents by default; choose the smallest relevant specialist set and always finish accepted phases with `verifier`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
