# Teste de disaster recovery (restore)

PITR configurado **não** equivale a restore validado. Este arquivo registra o ensaio exigido em staging.

## Resultado desta rodada

| Campo | Valor |
|---|---|
| data | 2026-08-30 |
| ambiente | staging Supabase com o mesmo schema deste repositório |
| backup utilizado | não executado |
| RPO observado | não medido |
| RTO observado | não medido |
| procedimento | ver `docs/24-rollback.md` §3 (PITR/backup da plataforma Supabase) + rollback de deployment Vercel §2 |
| resultado | **EXTERNAL_BLOCKED** — não há projeto de staging com este schema (`docs/26-go-live.md` D2). Restore real não foi disparado. |

## Procedimento a executar em staging (quando D2 existir)

1. Anotar o ponto no tempo (timestamp UTC) e o SHA do app Vercel correspondente.
2. Restaurar o projeto de **staging** (nunca produção) para um ponto anterior a uma escrita destrutiva de teste (ex.: eliminação LGPD de paciente fixture).
3. Confirmar: linhas Postgres, objetos de Storage e Auth voltam ao ponto escolhido.
4. Medir RPO (diferença entre o último write conhecido e o ponto restaurado) e RTO (início do restore até `/login` 200 no Preview de staging).
5. Reexecutar `pnpm test:security` contra o staging restaurado se o Postgres for o mesmo schema.
6. Registrar data, ambiente, backup utilizado, RPO, RTO e resultado neste arquivo. Sem números observados, o item permanece EXTERNAL_BLOCKED.

Não usar exportação lógica (`logical_exports`) como prova de DR.
