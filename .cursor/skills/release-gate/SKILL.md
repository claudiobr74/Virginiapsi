---
name: release-gate
description: Execute final Tesseli release verification for Vercel preview/production readiness.
disable-model-invocation: true
---
# Release Gate

1. Clean install.
2. lint.
3. typecheck.
4. unit/integration.
5. RLS/security suite.
6. Playwright desktop/mobile.
7. production build.
8. forbidden-dependency scan.
9. env contract review.
10. preview deployment smoke test.
11. verify integrations health without exposing secrets.
12. document rollback.

Return a checklist with PASS/FAIL/EXTERNAL_BLOCKED only. No optimistic completion language.
