# Financial Module v2 — Fase 3: planos, mensalidade e recorrências

## Objetivo

A Fase 3 transforma os marcadores de pacote/mensalidade/recorrência em ciclos financeiros reais e idempotentes, sem antecipar a separação caixa x competência da F4 nem Receita Saúde da F5.

## FI-06 — despesas recorrentes reais

Despesas marcadas como mensais deixam de ser apenas metadata.

A primeira despesa permanece como ocorrência raiz da série e recebe:

- `recurrence_series_key`
- `recurrence_occurrence_date`

O materializador cria as ocorrências mensais seguintes somente até a data atual, preservando o dia-âncora quando possível. Exemplo: uma despesa iniciada em 31/01 gera 28/02 (ou 29/02 em ano bissexto) e volta a 31/03.

A combinação organização + série + data da ocorrência é única, tornando a rotina segura para reexecução.

Uma despesa mensal exige `due_date`, pois sem vencimento não existe uma âncora determinística para a série.

O cancelamento da ocorrência raiz interrompe novas materializações da série. Ocorrências já criadas continuam como fatos financeiros auditáveis e podem ser tratadas individualmente.

## FI-07 — mensalidade com ciclo automático

Planos `monthly` continuam cobrindo sessões sem consumir unidade de pacote.

A F3 passa a criar uma cobrança `subscription` por aniversário mensal do plano, até o limite de `valid_until` quando existir.

Regras:

- a cobrança inicial criada na contratação continua válida;
- meses seguintes são materializados automaticamente;
- a data mensal preserva o dia de `valid_from` (ou a data de criação quando `valid_from` é nulo);
- meses com menos dias usam o último dia disponível;
- uma combinação `plan_id + competence_date` só pode existir uma vez;
- períodos de competência já fechados não são alterados retroativamente.

## FI-08 — pacote pós-pago consolidado

O pacote `postpaid_package` continua consumindo uma unidade por sessão.

Quando o último consumo esgota o total contratado:

- o plano passa a `exhausted`;
- é criada uma única cobrança consolidada `plan`;
- o valor é o `price` do pacote;
- a descrição é `Pacote pós-pago`;
- a cobrança é idempotente e não pode ser duplicada para o mesmo plano.

Antes do esgotamento não existe cobrança consolidada automática.

## Pré-pago

O comportamento validado anteriormente é preservado:

- cobrança integral na criação do pacote;
- consumo de sessões pelo ledger `financial_plan_movements`;
- nenhuma cobrança por sessão enquanto o pacote tiver saldo;
- restaurações e ajustes continuam append-only.

A interface já exibe sessões usadas, total e saldo restante, portanto a F3 não introduz uma segunda camada de produto para pacotes.

## Automação

Foi criada a função interna:

`public.materialize_finance_recurring_items(date)`

Ela materializa mensalidades e despesas mensais de forma idempotente.

No Supabase hospedado, onde `pg_cron` está instalado, a migration agenda execução diária às `03:15 UTC` (00:15 em São Paulo pelas regras atuais do fuso brasileiro), com o job:

`virginiapsi-finance-recurring-daily`

O agendamento é condicional à existência de `pg_cron`, mantendo a migration compatível com o PostgreSQL local do CI.

A função é interna:

- sem `EXECUTE` para `public`;
- sem `EXECUTE` para `anon`;
- sem `EXECUTE` para `authenticated`;
- `service_role` pode executá-la para operação/recuperação controlada.

## Testes da fase

Cobertura adicionada para:

- mensalidade em 31/01 gerando 28/02 e 31/03;
- reexecução sem duplicar cobranças;
- despesa mensal em 31/01 gerando ocorrências reais nos meses seguintes;
- reexecução sem duplicar despesas;
- pacote pós-pago sem cobrança antes de esgotar;
- uma única cobrança consolidada ao esgotar;
- exigência de vencimento para recorrência mensal;
- materializador inacessível a `anon` e `authenticated`.

## Deliberadamente fora da Fase 3

Permanece para as fases seguintes:

- definição contábil completa de caixa x competência — F4;
- fechamento independente de período de caixa — F4;
- relatórios financeiros revisados por base — F4;
- Central Financeira do Paciente — F5;
- modelo Receita Saúde-ready — F5;
- integração fiscal externa — fora do escopo atual.

## Critério de aprovação

A Fase 3 só é concluída depois de:

1. `foundation-gate` verde no HEAD final;
2. migration aplicada no Supabase hospedado;
3. validação dos índices/idempotência, ACLs da função interna e job `pg_cron`;
4. Security Advisor sem novo achado específico da F3.
