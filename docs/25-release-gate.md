# Release gate — Fase 13

Checklist do skill `release-gate`. Somente `PASS`, `FAIL` ou `EXTERNAL_BLOCKED`. Itens que dependem de verificação externa real **não** são mascarados como PASS.

Preenchido na implementação da Fase 13. Reexecutar o gate após cada mudança de produção. Processo posterior (multiusuário/multiclínicas, G0–G8): `docs/26-go-live.md`. **Não** tratar este arquivo como o inventário atual de produção.

G0 (2026-08-25): `GET /login` em `serena-psi-beta.vercel.app` respondeu **200** (não o 404 abaixo). A página ainda é a marca **Tesseli** antiga — não é o branch VirgíniaPsi. Região/schema Auth hospedados: EXTERNAL_BLOCKED.

## 1. Resultado por passo

| # | Passo | Resultado | Evidência / instrução |
|---|---|---|---|
| 1 | Clean install (`pnpm install --frozen-lockfile`) | PASS | CI `.github/workflows/ci.yml` (`pnpm install --frozen-lockfile`) |
| 2 | lint | PASS | `pnpm lint` no `pnpm gate` local |
| 3 | typecheck | PASS | `pnpm typecheck` no gate local |
| 4 | unit/integration | PASS | `pnpm test` — 288 testes |
| 5 | RLS/security suite | PASS | `pnpm test:security` — 146 testes contra PostgreSQL local (emulação `auth`/`RLS`, **não** o projeto hospedado) |
| 6 | Playwright desktop/mobile | PASS | `pnpm test:e2e` — 174 testes (`desktop-chromium` + `mobile-chromium`), 1 worker por causa do stub compartilhado |
| 7 | production build | PASS | `pnpm build` |
| 8 | forbidden-dependency scan | PASS | `tests/architecture/forbidden-dependencies.test.ts` + `pnpm scan:client-bundle` |
| 9 | env contract review | PASS | `docs/09-env-contract.md` e `.env.example` revisados. Valores de produção não estão no Git — ver §3 |
| 10 | preview deployment smoke test | PASS (Preview `/login`) / FAIL (Production `main` antigo) | SSO desligado. Causa do 404: projeto com `framework: null` — o build READY não publicava rotas Next. `vercel.json` com `framework: nextjs`. `GET /login` no alias da Fase 13 → **200**, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, sem `x-powered-by`. `serena-psi-beta.vercel.app` continua 404 (commit `9136183`). Ver §4 |
| 11 | integrations health sem expor secrets | PASS (código) / EXTERNAL_BLOCKED (produção) | Diagnósticos cobertos por testes. Saúde real em produção exige `/login` no host HTTPS (não localhost), OAuth Google cadastrado e remetente Twilio ainda não configurado |
| 12 | document rollback | PASS | `docs/24-rollback.md` |

**Release ready: não.** Passos locais 1–9 e 12 = PASS. Passo 10 = PASS no Preview `/login`; FAIL no `main` de produção antigo. Passo 11 (produção Tesseli) permanece EXTERNAL_BLOCKED.

## 2. Endurecimento entregue nesta fase

- Error boundaries (`src/app/error.tsx`, `src/app/global-error.tsx`) e `not-found.tsx` com primitivos canônicos. Mensagens genéricas; o `error` não é logado (pode carregar contexto operacional).
- Skip-link “Ir para o conteúdo principal” no `AppShell` → `#conteudo-principal`. Sessão em modo foco também expõe `<main id="conteudo-principal">`.
- Headers globais: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` (microfone só `self`). COEP/COOP permanecem só em `/session/:sessionId`. CSP por request com nonce (`src/lib/security/csp.ts` + `src/proxy.ts`): `script-src 'self' 'nonce-…' 'strict-dynamic'` — nunca `script-src *`.
- Rate limit **best-effort por instância** via interface `RateLimiter` + `InMemoryRateLimiter` (`src/lib/security/rate-limit.ts`): 30/min por IP nos endpoints de grant (`/api/session-capture/grant`, `upload-grant`); 20/min por organização+usuário nas server actions de Supervisor, Session AI e Knowledge. **Não** é cota global de cluster. Troca futura por store distribuído não deve alterar os consumidores `consumeAiRateLimit` / `consumeCaptureGrantRateLimit`.
- Teto de body: webhooks Twilio 32 KiB; JSON de grant/segmento 64 KiB; metadata de transcribe 16 KiB. Segmentos ao vivo **não** compartilham o rate limit de grant.
- Sem Cron na Vercel: `vercel.json` só declara `framework: nextjs` (o preset do projeto estava `null` e o Preview READY 404-ava em todas as rotas). Scheduler continua `pg_cron`/`pg_net`.
- CI Playwright com timeout de 45 min para a suíte completa.

## 3. Contrato de env em produção (revisão)

Todas as chaves de `docs/09-env-contract.md` precisam existir no Vercel (Production e Preview, com URLs de callback distintas) **e** no Vault do Supabase para o scheduler:

- Browser: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL` (HTTPS canônico, com `https://`; host sem esquema quebra o build).
- Server: `SUPABASE_SECRET_KEY`, Google OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` de produção, `GOOGLE_TOKEN_ENCRYPTION_KEY`), `SESSION_CAPTURE_SECRET`, Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, e **um** de `TWILIO_WHATSAPP_FROM` / `TWILIO_MESSAGING_SERVICE_SID` quando o envio for habilitado), `GEMINI_API_KEY` + modelos, `CRON_SECRET`.
- Opcional: `GROQ_API_KEY` só se o fallback de transcrição for habilitado.
- Vault: `tesseli_app_url` = `NEXT_PUBLIC_APP_URL` de produção; `tesseli_cron_secret` = mesmo valor de `CRON_SECRET`. Sem valores em migration.

`TWILIO_WHATSAPP_FROM` / Messaging Service permanecem vazios até o operador configurar o remetente. O boot já aceita os dois vazios; o envio falha de forma explícita, não silenciosa.

## 4. Como desbloquear os EXTERNAL_BLOCKED

### Preview/Production Vercel (passo 10)

SSO desligado. `vercel.json` força `framework: nextjs` (o preset do dashboard estava vazio). Preview da Fase 13: `GET /login` **200** em `tesseli-git-cursor-fase-13-ha-153b81-claudiobr74-9668s-projects.vercel.app`. Inspector: https://vercel.com/claudiobr74-9668s-projects/tesseli/4dJqbw2ZS3LmYVKLVRh1FM8eozv3. **Não** promover o `main` antigo (`9136183`); `serena-psi-beta.vercel.app` continua 404.

O que ainda falta:

1. Login Google: no cliente OAuth do Google Cloud, cadastrar `https://<ref>.supabase.co/auth/v1/callback`. Agenda: `{origem-do-Preview}/api/integrations/google/callback` no mesmo cliente, API Google Calendar **Ativar**, e o Gmail da clínica na lista de testadores (modo Testing). Depois do OAuth, o Tesseli tenta selecionar o calendário principal e puxar 30 dias; se a API estiver desligada, a modal mostra o erro em vez de “Carregando…”.
2. `TWILIO_WHATSAPP_FROM` / Messaging Service podem permanecer vazios.
3. **Não** criar Cron Jobs na Vercel.
4. Só promover Production depois de merge da Fase 13 (não o `main` antigo anterior à marca VirgíniaPsi).

### Saúde de integrações em produção (passo 11)

Depois do Preview: Google OAuth de produção (redirect URI cadastrada), Gemini com chave de prod, Twilio com remetente quando o operador autorizar. Não colar tokens na evidência — só status (`ok` / `missing` / erro genérico).

### RLS contra o projeto hospedado

A suíte `pnpm test:security` emula `auth.uid()` / JWT claims em PostgreSQL local. Não substitui um teste pontual no projeto Supabase de staging (service role só no servidor, forged JWT rejeitado pelo PostgREST real). Fazer isso no projeto hospedado e anexar evidência sem JWT.

### Validação jurídica humana

`docs/19-lgpd-privacy.md` (papéis, transferência internacional, texto do TCLE, resposta a incidente/ANPD) permanece `⚠ VALIDAÇÃO JURÍDICA HUMANA`. Sem parecer, não há PASS.

### Restore real de DR

`docs/24-rollback.md` descreve o procedimento. Executar um PITR/restore em **staging** e um rollback de deployment Vercel de Preview. Sem esse ensaio, DR operacional continua EXTERNAL_BLOCKED mesmo com o documento PASS.

## 5. Roteiro de endpoints HTTP

| Método | Caminho | Auth | Notas |
|---|---|---|---|
| GET | `/auth/callback` | OAuth code (query) | Callback Supabase Auth (App Router). Não existe `POST /api/auth/callback`. |
| GET | `/api/integrations/google/start` | sessão | Início OAuth Calendar |
| GET | `/api/integrations/google/callback` | state OAuth | Troca de code; sem secret no client |
| POST | `/api/session-capture/grant` | sessão + consent + rate limit | Grant de captura local |
| POST | `/api/session-capture/upload-grant` | sessão + consent + rate limit | Signed upload do fallback |
| POST | `/api/session-capture/segment` | sessão + grant + teto de body | Persistência de trecho; sem rate limit de grant |
| POST | `/api/session-capture/transcribe` | sessão + grant fallback | Metadata pequena; áudio não passa pela Vercel |
| POST | `/api/webhooks/twilio/inbound` | assinatura Twilio + teto 32 KiB | |
| POST | `/api/webhooks/twilio/status` | assinatura Twilio + teto 32 KiB | |
| POST | `/api/jobs/whatsapp-reminders` | `CRON_SECRET` **antes** de side effect | Invocado por `pg_net`, não Vercel Cron |
| POST | `/api/jobs/audio-retention` | `CRON_SECRET` **antes** de side effect | Diário 03:00 |

Server Actions (não são rotas HTTP estáveis para clientes externos) concentram mutações de domínio. Chamadas de IA passam pelo rate limit de 20/min por org+user.

## 6. Declaração

Release ready: **não**. PASS nos passos locais 1–9 e 12. Passo 10 = PASS no Preview `/login` (framework Next.js). FAIL no `main` de produção antigo. EXTERNAL_BLOCKED no passo 11 (produção Tesseli), RLS hospedado, restore DR real e validação jurídica.
