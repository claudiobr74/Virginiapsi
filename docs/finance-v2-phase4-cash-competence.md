# Financial Module v2 — Fase 4: caixa x competência e relatórios

## Objetivo

Separar explicitamente fatos de competência de fatos de caixa. A F4 não implementa Central Financeira do Paciente, Receita Saúde ou homologação final.

## Fechamentos

`financial_closings` passa a ter `scope`:

- `competence`: protege fatos produzidos/lançados no período;
- `cash`: protege recebimentos efetivamente registrados no período.

Fechamentos existentes são preservados como `competence` por default/backfill.

O mesmo intervalo pode ter um fechamento de competência e outro de caixa sem conflito.

## Regra crítica de pagamentos

Uma cobrança de janeiro pode receber pagamento em fevereiro mesmo com janeiro de competência fechado.

Por outro lado, se fevereiro de caixa estiver fechado, não é permitido registrar ou retroagir um pagamento cuja data civil de `paid_at`, no timezone da organização, pertença a fevereiro.

Isso resolve a pendência deliberadamente deixada pela F1.

## Relatórios

### Competência

- faturado: valor das cobranças cuja `competence_date` pertence ao período;
- despesas de competência: despesas pelo vencimento/data de competência operacional;
- resultado de competência: faturado menos despesas de competência.

### Caixa

- recebido: soma de pagamentos não estornados por `paid_at` no timezone da organização;
- despesas pagas: despesas com `status=paid` por `paid_at` no timezone da organização;
- resultado de caixa: recebido menos despesas efetivamente pagas.

Nenhum relatório deve derivar caixa a partir da competência da cobrança.

## CSV

A exportação por competência permanece uma linha por cobrança.

A exportação por caixa passa a ser uma linha por pagamento real, com coluna explícita `Data caixa`. Pagamentos parciais em meses diferentes permanecem separados e não transportam o total acumulado da cobrança para um único mês.

## Segurança

`finance_scope_period_is_closed(...)` e `assert_finance_period_open()` são funções internas e não devem ser executáveis por `anon` ou `authenticated`.

O fechamento continua sujeito às policies financeiras existentes e somente usuários com acesso `manage` podem fechar/reabrir períodos pela aplicação.

## Fora da Fase 4

- Central Financeira do Paciente — F5;
- modelo Receita Saúde-ready — F5;
- integração fiscal externa — fora do escopo atual;
- gate integrado, homologação e promoção — F6.

## Critério de aprovação

A F4 só pode ser encerrada quando migration, testes, ações de fechamento/exportação, integração de UI, documentação e foundation gate estiverem verdes no mesmo HEAD, seguidos de validação hospedada antes de qualquer avanço para F5.
