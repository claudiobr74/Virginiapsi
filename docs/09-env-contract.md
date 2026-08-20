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
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=

# Assina o session_capture_grant e o audio_fallback_upload_grant (Fase 6).
# Segredo dedicado — nunca reutilizar GOOGLE_TOKEN_ENCRYPTION_KEY aqui.
SESSION_CAPTURE_SECRET=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
# Um dos dois é exigido no envio; o boot aceita ambos vazios.
TWILIO_WHATSAPP_FROM=
TWILIO_MESSAGING_SERVICE_SID=

# Opcional: só quando a organização habilita o fallback de transcrição.
# Sem ela o app funciona inteiro com transcrição local no dispositivo.
GROQ_API_KEY=

GEMINI_API_KEY=
GEMINI_MODEL_SESSION=
GEMINI_MODEL_SUPERVISOR=
GEMINI_MODEL_KNOWLEDGE=
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

- `NEXT_PUBLIC_APP_URL` = origem HTTPS do ambiente;
- `GOOGLE_OAUTH_REDIRECT_URI` = `{NEXT_PUBLIC_APP_URL}/api/integrations/google/callback` cadastrado no Google Cloud;
- Vault `tesseli_app_url` aponta para a URL de **produção** (jobs não devem bater em Preview);
- Twilio From/Messaging Service só quando o operador habilitar o remetente — o schema aceita os dois vazios no boot.

Não criar Vercel Cron. Não marcar Preview como PASS sem um deployment real.

## Regras

- validar env no boot/server boundary com Zod;
- variáveis server-only não podem ser importadas por módulos client;
- criar teste que procura secrets conhecidos no client build quando possível;
- não usar chaves “fallback” entre provedores;
- se variável necessária não existir, falhar de forma explícita e segura.
