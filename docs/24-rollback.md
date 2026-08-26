# Rollback e recuperação (DR)

Este documento fecha o P2 de DR/rollback da auditoria pré-implementação. **Exportação lógica (`logical_exports`) não é disaster recovery.** Ela serve a portabilidade, auditoria e atendimento a titular. Recuperação de incidente de plataforma usa backup/PITR do Supabase e revert de deploy no Vercel.

## 1. O que restaurar, e o que não restaurar

| Camada | Fonte da verdade | Rollback |
|---|---|---|
| Dados (Postgres, Auth, Storage) | Projeto Supabase | PITR / backup da plataforma Supabase |
| Aplicação Next.js | Git + Vercel | Redeploy do commit anterior (Promotion/Rollback no dashboard, ou `vercel rollback` com o deployment anterior) |
| Segredos | Vercel Environment Variables + Supabase Vault | Rotação nos dois lados; nunca “voltar” um segredo pelo Git |
| Scheduler | `pg_cron` + `pg_net` no Postgres | As migrations são a fonte; não há Vercel Cron a desligar |
| Exportação lógica Tesseli | Bucket `tesseli-exports` | Não usar para restaurar o banco. É um ZIP de portabilidade |

Não usar Google Drive, exportação ZIP ou dump ad hoc como plano de DR.

## 2. Rollback de aplicação (Vercel)

1. Identificar o deployment de produção atual e o último conhecido como saudável (commit SHA no GitHub + URL do deployment).
2. No dashboard Vercel: Promote o deployment anterior **ou** Rollback para aquele deployment. Não “corrigir” produção com patch de compatibilidade em cima de um build quebrado.
3. Confirmar que as Environment Variables de Production não mudaram junto com o deploy defeituoso. Se mudaram, reverter os valores **antes** de promover o deployment antigo — senão o binário antigo sobe com o contrato de env novo.
4. Smoke mínimo após o rollback (sem colar secrets nos logs):
   - `/login` responde 200 e envia `X-Content-Type-Options: nosniff`;
   - login real autentica;
   - `/app` carrega o shell;
   - diagnósticos em `/app/settings` (Integrações) sem expor secrets.
5. Registrar o incidente internamente (hora, SHA de ida, SHA de volta, o que foi observado). Não gravar transcrição, DPEP, tokens ou números de WhatsApp nesse registro.

## 3. Rollback / recuperação de dados (Supabase)

1. Confirmar a região do projeto e se PITR está habilitado no plano. Sem PITR, o RPO é o último backup automático da plataforma — anotar isso **antes** de um incidente, não durante.
2. Restaurar para um ponto **anterior** à escrita destrutiva (eliminação LGPD, migration falha, purge de áudio indevido). Restaurar para um ponto *depois* da eliminação reintroduz dado que deveria ter saído.
3. Storage (buckets `session-audio-fallback`, `tesseli-exports`, documentos, knowledge) segue o mesmo ponto no tempo do Postgres quando o backup da plataforma inclui os dois. Validar no dashboard Supabase o que o plano cobre.
4. Após restore: rodar as migrations que existirem **depois** do ponto restaurado somente se forem compatíveis com o binário Vercel em produção. Se o restore voltar o schema e o app novo esperar colunas novas, faça rollback do app **junto**.
5. Vault (`tesseli_app_url`, `tesseli_cron_secret`): restore de banco **não** deve ser a forma de recuperar esses valores. Eles vivem no Vault; se corrompidos, reprovisione fora do Git.

## 4. Jobs e efeitos colaterais

- Lembretes WhatsApp: o outbox é idempotente (`unique appointment_id + reminder_type`). Após restore, um job pode reenviar se o outbox voltar a `scheduled`. Preferir pausar o cron (`cron.unschedule` dos jobs Tesseli) durante a janela de restore, depois reabilitar.
- Retenção de áudio (`0 3 * * *`): restore pode **ressuscitar** objetos já purgados se o Storage também voltar. Isso é esperado em DR; não é reprocessamento LGPD. Se a restauração for posterior a uma eliminação de titular, reexecutar o fluxo de eliminação.
- Grants de captura são de vida curta e não sobrevivem a restart; sessão em andamento precisa de novo grant.

## 5. O que não fazer

- Não tratar `pnpm build` local como prova de rollback.
- Não commitar dumps, signed URLs ou `.env`.
- Não usar Vercel Cron como compensação se `pg_cron` estiver pausado.
- Não declarar DR testado sem um restore real (projeto de staging) — ver `docs/25-release-gate.md`.
