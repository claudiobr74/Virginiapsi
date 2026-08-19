# Fase 0 — Fundação do SerenaPsi

## Pré-condição obrigatória

NÃO inicie esta fase até que:
- `CLAUDE_PRE_IMPLEMENTATION_REVIEW_PROMPT.md` tenha sido executado em Plan Mode;
- exista relatório de auditoria pré-implementação revisado pelo usuário;
- não haja P0 aberto;
- o usuário tenha autorizado explicitamente o início da implementação.

Se qualquer condição acima não estiver atendida, pare e reporte `PRE_IMPLEMENTATION_GATE_NOT_APPROVED`.

Execute `/bootstrap-serenapsi`.

Objetivo: criar somente a fundação técnica do repositório SerenaPsi. Não implemente módulos funcionais.

Antes de editar, peça ao `architecture-guardian` para revisar o plano.

Entregue:
- Next.js/TypeScript/Tailwind base;
- pnpm;
- lint/typecheck/Vitest/Playwright;
- estrutura de features;
- Supabase CLI/config local;
- env schema;
- CI;
- README de execução local.

Proibido: Firebase, Firestore, Express/NestJS paralelos, Drizzle/ORM duplicando o schema do Supabase e mocks que substituam contratos essenciais do produto.

Gate obrigatório: install + lint + typecheck + test + build + scan de dependências/arquitetura proibidas. Pare ao final.
