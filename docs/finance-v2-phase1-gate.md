# Financeiro v2 — Fase 1 gate

Validação da F1 no branch único `finance/financial-module-v2`.

Escopo presente neste gate:

- permitir recebimento posterior de cobrança cuja competência já foi fechada, mantendo bloqueio de novos fatos de competência;
- calcular competência de sessão pelo timezone configurado em `organizations.timezone`;
- introduzir RPC transacional para criação atômica de plano + cobrança inicial;
- manter os baselines da F0 e inverter deliberadamente o teste do pagamento tardio.

A RPC atômica ainda não substitui o action de UI neste checkpoint; esse wiring será feito dentro da própria F1 somente depois que a migration e os testes de banco passarem no gate. Nenhuma migration da F1 deve ser aplicada ao Supabase hospedado antes da validação completa do código.
