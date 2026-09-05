# VirgíniaPsi — fluxo canônico do repositório

Este documento existe para evitar divergência entre branches, previews, PRs empilhados e produção.

## Branches canônicas

### `main`

- Fonte **exclusiva** de produção.
- Nunca desenvolver diretamente nela.
- Nunca fazer force-push.
- Só recebe PR de release vindo de `staging`.
- Um deploy de produção deve registrar o SHA exato de `main`.

### `staging`

- Linha única de integração e validação humana.
- Todo trabalho novo deve partir desta branch, salvo hotfix real de produção.
- Deve possuir um Preview/alias Vercel estável para testes de OAuth, microfone, Groq e integrações externas.
- Nunca usar URL efêmera de deployment como callback canônico quando uma URL estável puder ser usada.

## Branches de trabalho

Usar branches curtas e descritivas:

- `feature/<dominio>-<descricao>`
- `fix/<dominio>-<descricao>`
- `hotfix/<descricao>` somente quando o defeito estiver em produção
- `chore/<descricao>` para manutenção sem mudança funcional

Branches `cursor/*` geradas por agentes podem existir durante a tarefa, mas não devem se tornar a linha permanente de integração.

## Pull requests

### Regra principal

Evitar PRs empilhados em cadeia. Não criar uma nova cadeia longa de PRs onde cada PR usa o anterior como base.

Fluxo normal:

```text
staging
  └── feature/fix branch
          └── PR → staging

staging validado
  └── Release PR → main
```

### Um PR por mudança lógica

Cada PR deve declarar:

- branch base e head;
- SHA inicial e SHA final;
- root cause quando for correção;
- arquivos alterados;
- migrations: `NONE`, `REQUIRED` ou `APPLIED` com evidência;
- testes realmente executados;
- validação local, integração, Preview e produção separadamente;
- blockers externos;
- URL do Preview + SHA do deploy;
- rollback quando houver risco relevante.

`PASS` só pode ser usado para algo realmente executado e observado.

## Release

Antes de `staging → main`:

1. `pnpm lint`
2. `pnpm typecheck`
3. unit tests
4. security tests
5. production build
6. client secret scan
7. E2E proporcional ao risco
8. validação manual quando envolver hardware/browser/OAuth
9. migrations locais e remotas comparadas
10. Preview deve apontar para o SHA que será promovido

Depois do merge:

- confirmar o SHA de `main`;
- confirmar deployment Production no mesmo SHA;
- executar smoke test em produção;
- só então fechar PRs/branches substituídos.

## Migrations Supabase

Nunca executar `supabase db push` de forma cega.

Sempre:

1. comparar histórico local e remoto;
2. identificar migrations equivalentes com timestamps diferentes;
3. separar migration da feature de migrations antigas pendentes;
4. interromper se houver migration não relacionada;
5. documentar SQL, impacto e rollback antes de alteração destrutiva.

## OAuth e Vercel Preview

- Login Google e Google Calendar são integrações diferentes.
- Produção usa domínio canônico de produção.
- Staging deve usar **um domínio/alias estável**.
- Não cadastrar um novo callback a cada deployment efêmero.
- Nunca concluir que um erro de OAuth é `redirect_uri_mismatch` sem observar o erro real.

## Limpeza de PRs antigos

Fechar PR antigo somente quando uma destas condições for comprovada:

1. o HEAD do PR é ancestral de `main`; ou
2. o conteúdo foi incorporado em uma branch canônica e isso foi auditado; ou
3. ele foi explicitamente substituído por outro PR e nenhuma mudança exclusiva permanece.

Ao fechar, comentar:

`Superseded by <PR/branch>. No unique changes remain after ancestry/diff audit.`

Não apagar branches históricas até a release correspondente estar confirmada em produção.

## Proteções obrigatórias no GitHub

Configurar Ruleset/Branch Protection para `main`:

- bloquear push direto;
- exigir pull request;
- exigir `foundation-gate`/CI verde;
- bloquear force-push;
- bloquear deleção;
- exigir branch atualizada antes do merge quando aplicável.

Recomendado também para `staging`, permitindo apenas merge por PR.

## Estado canônico em 2026-09-01

- `main`: produção histórica; não deve receber desenvolvimento direto.
- `staging`: criada a partir do HEAD validado da linha Groq/Auth (`de12f7b25f222e97ff584343ea1ee85077bd34b8`).
- PRs antigos devem ser auditados e fechados gradualmente; não usar mais a cadeia de PRs antiga como base para novas funcionalidades.

## Regra para agentes Cursor/IA

Antes de qualquer alteração:

```text
OBSERVAR
→ COMPARAR
→ ROOT CAUSE
→ PLANO MÍNIMO
→ ALTERAR
→ TESTAR
→ VERIFICAR
→ DOCUMENTAR
```

O agente deve sempre executar e registrar:

```bash
git status
git branch --show-current
git rev-parse HEAD
git log -8 --oneline
```

Se a branch não descender da `staging` atual para trabalho normal, interromper e corrigir a base antes de implementar.
