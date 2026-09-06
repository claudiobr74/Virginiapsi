# Financeiro v2 — Fase 1: regras financeiras críticas

## Escopo

A F1 corrige apenas regras críticas já identificadas e congeladas na F0. Não adiciona recorrência, novos relatórios ou novas features de UI.

## FI-01 — recebimento após fechamento de competência

### Regra anterior

O trigger `financial_payments_period_lock` usava a `competence_date` da cobrança. Isso fazia uma cobrança de competência já fechada rejeitar um pagamento realizado posteriormente.

### Regra F1

- cobranças continuam bloqueadas quando a sua competência está fechada;
- despesas continuam bloqueadas segundo a regra de competência vigente;
- pagamentos são fatos de caixa e podem ser registrados posteriormente, mesmo quando a cobrança pertence a competência fechada;
- as regras de saldo, idempotência, organização, cancelamento/refund e RLS continuam valendo;
- estornos permanecem auditáveis e não reescrevem a competência da cobrança.

## FI-02 — timezone da competência de sessão

### Regra anterior

`create_session_charge` convertia `started_at` usando UTC.

### Regra F1

A competência passa a usar `organizations.timezone`, cujo padrão é `America/Sao_Paulo`. Assim, por exemplo, `2026-09-06T01:30:00Z` pertence a `2026-09-05` em Goiânia/São Paulo.

A timezone configurada precisa ser válida; o PostgreSQL valida o identificador ao executar `AT TIME ZONE`.

## FI-03 — atomicidade

A investigação da F1 separa dois casos:

1. `create_session_charge` já é uma única função PostgreSQL: consumo de pacote ou criação da cobrança ocorre dentro da mesma transação da chamada.
2. fluxos de criação de plano + cobrança originados na camada de aplicação ainda devem ser tratados como uma unidade lógica. Essa parte só deve ser alterada após inspeção do action atual e teste de regressão específico, evitando ampliar a migration sem necessidade.

## Testes F1

A suíte `tests/security/finance-v2-baseline.test.ts` foi evoluída deliberadamente:

- o antigo KNOWN F0 de pagamento tardio foi invertido: agora o pagamento deve ser aceito;
- o mesmo teste confirma que novos fatos de competência continuam bloqueados;
- foi adicionado caso de fronteira de timezone para sessão noturna;
- todos os demais baselines F0 permanecem ativos.

## Rollout

A migration permanece somente no branch até o foundation gate ficar verde. Não aplicar no Supabase hospedado antes desse gate.
