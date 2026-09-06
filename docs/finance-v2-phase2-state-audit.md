# Financial Module v2 — Fase 2: estados e auditoria

## Objetivo

A Fase 2 elimina divergências de estado financeiro dependentes do tempo e melhora a rastreabilidade das operações destrutivas, sem iniciar ainda recorrência financeira, separação completa caixa x competência ou Receita Saúde.

## FI-04 — atraso como fonte única de verdade

Foram adicionadas duas views de leitura com `security_invoker = true`:

- `public.financial_charges_effective`
- `public.financial_expenses_effective`

As views aplicam o timezone da organização e herdam o RLS das tabelas-base. A UI e as queries passam a ler os estados efetivos, sem mutar registros apenas por leitura.

Para cobranças, a precedência efetiva é:

1. `canceled` / `refunded`
2. `paid`
3. `overdue` quando existe saldo e o vencimento já passou no dia civil da organização
4. `partially_paid`
5. `pending`

`refresh_charge_status()` foi alinhada à mesma precedência. Uma cobrança parcialmente paga e vencida passa a ter estado operacional `overdue`; o valor já recebido continua preservado por `paidCents`.

A UI não recalcula mais atraso com uma segunda regra baseada em `due_date < today`. O estado `overdue` recebido do read model efetivo é a fonte canônica.

## FI-05 — motivos auditáveis

O financeiro deixa de usar automaticamente motivos genéricos como `Cancelamento operacional` e `Estorno operacional`.

A interface passa a exigir motivo real, entre 3 e 300 caracteres, para:

- cancelamento/estorno de cobrança;
- estorno de pagamento;
- cancelamento de despesa;
- cancelamento de plano;
- reabertura de período fechado.

`financial_closings` agora possui `reopen_reason`.

O trigger `assert_financial_closing_reopen_reason()` exige motivo válido na transição `closed -> open`, preenche `reopened_at` e `reopened_by`, e não fica exposto como RPC para `anon` ou `authenticated`.

A reabertura também gera evento de auditoria `finance.closing.reopen` com o motivo informado.

## FI-10 — NFS-e

A ação existente continua sendo somente um marcador administrativo. A interface foi renomeada para deixar isso inequívoco:

- `Marcar solicitação de NFS-e`
- `NFS-e marcada`
- aviso: `NFS-e: registro administrativo; não emite nota fiscal automaticamente.`

Nenhuma integração externa de emissão fiscal foi implementada nesta fase.

## Segurança

As views efetivas:

- revogam acesso de `public` e `anon`;
- concedem `SELECT` a `authenticated`;
- usam `security_invoker`, portanto não contornam o RLS das tabelas-base.

A função interna do trigger de reabertura não possui permissão de execução para `public`, `anon` ou `authenticated`.

## Testes da fase

Cobertura adicionada para:

- charge efetivamente overdue sem mutar o fato-base por leitura;
- precedência de overdue sobre partially paid;
- despesa efetivamente overdue;
- reabertura exigindo motivo real e registrando autor/data;
- bloqueio de leitura das views por `anon`;
- ausência dos motivos genéricos antigos na UI;
- uso do estado efetivo de atraso na UI;
- texto explícito de que NFS-e é marcador administrativo.

## Deliberadamente fora da Fase 2

Permanece para fases posteriores:

- recorrência real de despesas — F3;
- renovação/ciclo mensal e consolidação pós-paga — F3;
- separação completa entre fechamento de competência e fechamento de caixa — F4;
- semântica de bloqueio de pagamento retrodatado em período de caixa fechado — F4;
- Central Financeira do Paciente — F5;
- modelo e integração Receita Saúde — F5;
- integração fiscal externa de NFS-e — futura, somente após definição explícita de escopo.

## Critério de aprovação

A Fase 2 só pode ser considerada concluída quando o `foundation-gate` estiver verde no HEAD final contendo migration, queries, UI, testes e esta documentação, e a migration for aplicada e validada no Supabase hospedado.
