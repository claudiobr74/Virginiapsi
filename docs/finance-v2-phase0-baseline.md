# Financeiro v2 — Fase 0: baseline

## Objetivo

Congelar o comportamento financeiro atual antes das mudanças das fases F1–F5. Esta fase não altera regra de negócio, migration, RLS, UI ou dados hospedados.

## Base

- Branch único: `finance/financial-module-v2`
- Base funcional: `main` após a promoção validada do ciclo anterior.
- Target futuro do módulo: `staging`.
- `main` permanece intocada durante o desenvolvimento.

## Cobertura já existente preservada

A suíte `tests/security/finance.test.ts` já cobre, entre outros pontos:

- acesso da secretaria `none` / `view` / `manage`;
- proibição de hard delete de fatos financeiros;
- isolamento entre organizações;
- idempotência de cobrança de sessão;
- idempotência de pagamento;
- cálculo exato de centavos e bloqueio de pagamento acima do saldo;
- bloqueio de lançamento em competência fechada;
- estorno auditável sem delete;
- consumo de pacote pré-pago.

## Cobertura adicionada na F0

`tests/security/finance-v2-baseline.test.ts` congela:

1. pagamento parcial + estorno e recomposição do status;
2. pacote pós-pago consumindo sessão sem cobrança avulsa;
3. mensalidade cobrindo sessão sem consumo de unidade e sem cobrança avulsa por sessão;
4. restauração de sessão via ledger de movimentos;
5. comportamento atual da despesa marcada como recorrente;
6. limitação conhecida em que o fechamento da competência bloqueia pagamento posterior da cobrança.

## Known issues deliberadamente NÃO corrigidos na F0

### FI-01 — pagamento tardio após fechamento

Hoje o trigger de período fechado resolve a competência da cobrança ao inserir/alterar pagamento. Consequência: uma cobrança de janeiro pode não aceitar um pagamento realizado em fevereiro se janeiro estiver fechado.

**Destino:** F1. O teste F0 registra o comportamento atual e deverá ser invertido quando a correção for implementada.

### FI-02 — competência de cobrança de sessão usa UTC

`create_session_charge` deriva a competência a partir de `started_at` em UTC, o que pode deslocar sessões noturnas no timezone da organização.

**Destino:** F1.

### FI-03 — criação de plano + cobrança não é operação atômica

Para plano pré-pago/mensal, o plano pode ser criado e a cobrança correspondente falhar, deixando estado parcial.

**Destino:** F1.

### FI-04 — atraso persistido pode divergir do atraso calculado

O frontend consegue inferir atraso por `due_date < hoje`, enquanto o status persistido não é necessariamente atualizado apenas pela passagem do tempo.

**Destino:** F2.

### FI-05 — motivos operacionais genéricos

Cancelamentos/estornos/reaberturas podem usar justificativas automáticas em vez da justificativa real do usuário.

**Destino:** F2.

### FI-06 — recorrência de despesas é apenas metadado

O marcador `{ interval: "monthly" }` não possui, no baseline, motor que gere lançamentos futuros.

**Destino:** F3.

### FI-07 — mensalidade não possui ciclo automático de renovação

O plano mensal cobre sessões, porém não existe no baseline um motor recorrente de cobranças mensais subsequentes.

**Destino:** F3.

### FI-08 — pacote pós-pago ainda não fecha ciclo em cobrança consolidada

O ledger consome sessões, mas o baseline não consolida automaticamente o ciclo pós-pago em cobrança.

**Destino:** F3.

### FI-09 — caixa e competência não estão separados de forma uniforme

Alguns KPIs usam pagamentos associados a cobranças da competência do mês, em vez da data efetiva do pagamento.

**Destino:** F4.

### FI-10 — NFS-e é marcador, não integração fiscal

`nfse_requested_at` representa intenção administrativa; não há emissão fiscal integrada.

**Destino:** manter explícito; integração real só se houver decisão futura.

### FI-11 — recibo administrativo não é Receita Saúde

O recibo PDF atual é documento administrativo. O modelo financeiro futuro deve ficar preparado para registrar o ciclo de Receita Saúde sem confundir os dois documentos.

**Destino:** F5.

## Critério de aprovação da F0

- nenhum arquivo funcional do módulo financeiro alterado;
- nenhuma migration nova;
- nenhuma alteração no Supabase hospedado;
- suíte financeira antiga permanece verde;
- novos testes de baseline permanecem verdes;
- foundation gate completo verde no HEAD da F0.

Somente após esse gate a F1 pode alterar regras financeiras.
