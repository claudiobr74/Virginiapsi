# Contrato de Variáveis de Ambiente

Nunca commitar valores reais.

Verificado em documentação oficial em 18/08/2026: as chaves legadas `anon`/`service_role` (JWT) estão marcadas para deprecação até o fim de 2026. Este projeto usa a geração nova desde o início — `sb_publishable_...` substitui `anon`, `sb_secret_...` substitui `service_role`. Ambas trafegam no header `apikey`, nunca em `Authorization: Bearer`.

## Browser-safe

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Server-only

```env
SUPABASE_SECRET_KEY=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_TOKEN_ENCRYPTION_KEY=

# Assina session_remote_transcription_grant, session_capture_grant (legado) e audio_fallback_upload_grant.
# Segredo dedicado — nunca reutilizar GOOGLE_TOKEN_ENCRYPTION_KEY aqui.
# A emissão/verificação do grant valida SOMENTE esta chave (`parseSessionCaptureEnv`).
SESSION_CAPTURE_SECRET=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
# Um dos dois é exigido no envio; o boot aceita ambos vazios.
TWILIO_WHATSAPP_FROM=
TWILIO_MESSAGING_SERVICE_SID=

# Transcrição ao vivo (parser isolado `getGroqTranscriptionEnv()`).
# O boot do app (`parseServerEnv`) ainda aceita GROQ_API_KEY ausente para
# Agenda/Configurações; o caminho transcribe-chunk exige a chave.
GROQ_API_KEY=
# Opcional. Default: whisper-large-v3-turbo
GROQ_TRANSCRIPTION_MODEL=
# Opcional. Inteiro 5000–120000 (ms).
GROQ_TRANSCRIPTION_TIMEOUT_MS=

GEMINI_API_KEY=
GEMINI_MODEL_SESSION=
GEMINI_MODEL_SUPERVISOR=
GEMINI_MODEL_KNOWLEDGE=
# Opcional — default gemini-3.6-flash no módulo Documentos.
GEMINI_MODEL_DOCUMENTS=
GEMINI_EMBEDDING_MODEL=

CRON_SECRET=
```

## Supabase Vault para scheduler

O scheduler de lembretes e o job de retenção de áudio usam Supabase Cron + `pg_net`. No Supabase Vault, provisionar fora do versionamento:
- `tesseli_app_url`: URL HTTPS canônica do app/endpoint de job;
- `tesseli_cron_secret`: mesmo valor de `CRON_SECRET` configurado no Vercel/ambiente server-side.

O cron diário (`0 3 * * *`) chama `POST /api/jobs/audio-retention`. O de lembretes (a cada 5 min) chama `POST /api/jobs/whatsapp-reminders`. Ambos validam `CRON_SECRET` **antes de qualquer side effect**.

Não gravar valores do Vault em migrations, fixtures, logs ou documentação. Rotação do segredo deve atualizar ambos os lados.

## Produção (Vercel)

Preview e Production recebem o mesmo conjunto de chaves, com URLs distintas:

- `NEXT_PUBLIC_APP_URL` = origem HTTPS completa (`https://…`), sem aspas e sem caminho (`/login`). Vazio, inválido ou localhost (`.env` importado) no Preview/Production: o parser público usa `VERCEL_URL`. A variável precisa existir no **Build** também, não só no Runtime;
- Agenda/Calendar: o callback OAuth é sempre `{NEXT_PUBLIC_APP_URL}/api/integrations/google/callback` (domínio canônico estável, cadastrado no Google Cloud). Não há URI de callback configurável à parte. Preview/host efêmero nunca vira callback; a conexão deve ser feita no domínio oficial. Conectar a Agenda valida só as chaves Google + `NEXT_PUBLIC_APP_URL`; Twilio, Gemini e `CRON_SECRET` não bloqueiam esse botão. O cliente admin de Storage valida só `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` — upload de foto não exige Twilio, Gemini, Google Calendar nem `CRON_SECRET`. A tela Configurações também não exige o contrato servidor completo: diagnósticos marcam integrações ausentes em vez de derrubar o módulo;
- `SESSION_CAPTURE_SECRET` assina e verifica o grant de captura. `issueCaptureGrant` / `verifyCaptureGrantToken` usam `getSessionCaptureEnv()` e **não** o contrato servidor amplo. A transcrição ao vivo lê Groq só via `getGroqTranscriptionEnv()`.
- Login com Google (botão Entrar) usa o provider Auth do Supabase. No Google Cloud, a **Authorized redirect URI** desse cliente tem de ser `https://<ref-do-projeto>.supabase.co/auth/v1/callback`. A URL do Tesseli (`…/auth/callback`) entra só em Authentication → URL Configuration → Redirect URLs no Supabase, não no Google Cloud. Com PKCE flow-id, o retorno pode incluir `?sb_flow_id=`; a allow list do Preview precisa de wildcard (`https://*-claudiobr74-9668s-projects.vercel.app/**`). O callback usa `x-forwarded-host` para permanecer no hostname estável do Preview;
- **Site URL** do Auth não pode ficar `http://localhost:3000` se o login for na Vercel: o Google autentica e o navegador abre localhost (`ERR_CONNECTION_REFUSED`, `/?code=…`). Site URL = origem HTTPS do Preview/Production; Redirect URLs incluem `{origem}/auth/callback` **e** `http://localhost:3000/auth/callback` (dev). Wildcard de Preview: `https://*-claudiobr74-9668s-projects.vercel.app/**`;
- Vault `tesseli_app_url` aponta para a URL de **produção** (jobs não devem bater em Preview);
- Twilio From/Messaging Service só quando o operador habilitar o remetente — o schema aceita os dois vazios no boot.

Não criar Vercel Cron. Não marcar Preview como PASS sem um deployment real.

## Regras

- validar env no boot/server boundary com Zod;
- variáveis server-only não podem ser importadas por módulos client;
- criar teste que procura secrets conhecidos no client build quando possível;
- não usar chaves “fallback” entre provedores;
- se variável necessária não existir, falhar de forma explícita e segura.
