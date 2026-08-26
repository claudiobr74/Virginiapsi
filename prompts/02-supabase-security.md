# Fase 2 — Tenancy, RBAC, RLS e Auditoria

Use `supabase-security` e `/supabase-migration-rls`.

Implemente migrations novas para organizations, organization_members, practice_settings e audit_events. Crie helpers/policies de tenant/role e bootstrap de membership.

Implemente active organization sem `members[0]`. Se múltiplas, seleção explícita; se uma, auto seleção apenas como UX. RLS continua sendo enforcement.

Crie testes reais/local Supabase para:
- sem auth;
- JWT forjado;
- tenant A x B;
- multi-membership;
- roles;
- service role não exposta.

Gate: `/security-gate`. Não avance se qualquer auth/RLS test estiver mockando a proteção real.


Especificações obrigatórias desta fase:
- `practice_settings.secretary_finance_access` enum none/view/manage default none e base para RLS financeiro;
- helpers SECURITY DEFINER, quando necessários, devem ser STABLE, `SET search_path=''`, schema-qualified e com EXECUTE mínimo;
- `session_transcript_segments` terá `unique(session_id, sequence)` quando a tabela for criada na migration correspondente.
