# Fase 10 — Financeiro

Use `/feature-slice`.

Implemente subabas Hoje, Recebimentos, Despesas e Relatórios.

Cobrir:
- `practice_settings.secretary_finance_access` none/view/manage com RLS real;
- charges;
- payments;
- avulsa/pacote/mensalidade;
- partial/late/void;
- plan movements;
- expenses;
- receipts individual/lote;
- fechamento mensal;
- CSVs contábeis configuráveis.

Dinheiro: numeric no banco e cálculo decimal seguro. Hard delete financeiro é negado; usar void/cancel/estorno auditável. Finalização de sessão → cobrança deve ser idempotente.

Gate: money arithmetic + duplicate finalization/payment + RLS secretary finance none/view/manage + no hard delete + E2E. Pare.
