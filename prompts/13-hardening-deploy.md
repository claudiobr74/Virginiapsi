# Fase 13 — Hardening e Deploy

Use `architecture-guardian`, `supabase-security`, `verifier` e `/release-gate`.

Faça revisão final de:
- dependências;
- code duplication;
- forbidden or deprecated dependencies;
- auth/RLS/storage;
- webhook/OAuth;
- logs;
- payload sizes;
- accessibility;
- responsive;
- performance;
- error boundaries;
- E2E completo.

Configure Vercel preview/prod e secrets. Não corrija falhas com patches de compatibilidade; use `debugger` para root cause.

Somente declarar release ready com checklist final PASS. Itens que dependam de verificação externa real podem ser EXTERNAL_BLOCKED com instruções precisas, mas nunca mascarados como PASS.
