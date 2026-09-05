## Objetivo

Descreva em 1–3 frases o que muda e por quê.

## Contexto Git

- Base branch: `staging`
- Head branch:
- SHA inicial:
- SHA final:

## Root cause

- Confirmado: YES / NO / N/A
- Evidência:

## Escopo

### Incluído

-

### Fora de escopo

-

## Dados / migrations

- Migration: NONE / REQUIRED / APPLIED
- Histórico local/remoto comparado: PASS / NOT_VERIFIED / N/A
- `supabase db push` cego utilizado: NO
- SQL destrutivo: NO / YES — explicar e obter aprovação

## Segurança e privacidade

- Auth/RBAC/RLS afetados: NO / YES
- Dados clínicos afetados: NO / YES
- Secrets adicionados ao client: NO
- Logs contêm conteúdo clínico/segredos: NO

## Validação

### Local

- [ ] lint
- [ ] typecheck
- [ ] unit
- [ ] security
- [ ] build
- [ ] client secret scan

### Integração / E2E

- [ ] testes focados executados
- [ ] regressões relacionadas executadas

### Preview

- URL:
- Deployment SHA:
- Preview realmente corresponde ao HEAD: PASS / NOT_VERIFIED

### Validação manual necessária

- [ ] nenhuma
- [ ] browser real
- [ ] dispositivo móvel real
- [ ] microfone/câmera
- [ ] OAuth real
- [ ] integração externa real
- [ ] outra:

## Resultado

Use somente:

- `PASS`
- `FAIL`
- `NOT_VERIFIED`
- `EXTERNAL_BLOCKED`
- `FAIL_TIMEOUT`

## Rollback

Explique como retornar ao estado anterior se necessário.

## Deploy

- Production deploy realizado: NO / YES
- Production SHA:

> CI verde ou Preview verde não equivalem a produção validada.
