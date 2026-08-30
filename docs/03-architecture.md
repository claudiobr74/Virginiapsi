# Arquitetura Técnica

## Decisão principal

Um único aplicativo Next.js no Vercel. Supabase é o backend persistente. Não existe servidor Express/Nest paralelo.

## Camadas

### Browser

- componentes React;
- Supabase browser client apenas para operações expressamente seguras por RLS;
- comunicação com Route Handlers para integrações secretas e operações sensíveis;
- transcrição local no dispositivo (WebGPU/WASM), iniciada somente após autorização/consentimento aplicável; o áudio não sai da máquina no caminho padrão.

### Next.js server

Responsável por:

- validação de sessão em ações sensíveis;
- OAuth Google;
- chamadas Google Calendar;
- Twilio send/webhooks;
- endpoint autenticado de processamento do outbox de lembretes (`/api/jobs/whatsapp-reminders`);
- emissão de grant de captura (e do grant de upload do fallback) somente após authorization + consent gate;
- chamadas Gemini server-side, com consent gate quando aplicável e runtime prompts versionados;
- geração/coordenação de PDFs quando necessário;
- service-role apenas para operações administrativas cuidadosamente isoladas;
- auditoria.

### Supabase

- Postgres: fonte de verdade;
- Supabase Cron (`pg_cron`) como scheduler oficial de lembretes, com `pg_net` para invocar o endpoint server-side do Next.js;
- Supabase Vault para armazenar o segredo/URL usados pelo job agendado;
- Auth;
- Storage privado;
- RLS;
- pgvector;
- migrations SQL versionadas.

## Contratos

Use Zod em boundaries. Evitar transportar entidades gigantes.

DTOs separados:

- AdministrativePatientDTO
- ClinicalPatientDTO
- AppointmentDTO
- SessionClinicalDTO
- FinanceDTO
- DocumentMetadataDTO

A Secretaria nunca recebe DTO clínico e não depende do frontend para ocultar campos.

## Organização ativa

Não usar `members[0]`.

Fluxo:

1. usuário autentica;
2. app carrega memberships ativas;
3. se houver uma, seleciona automaticamente;
4. se houver várias, usuário escolhe;
5. active organization é contexto de sessão/UI;
6. cada operação filtra por `organization_id`;
7. RLS valida que `auth.uid()` pertence à organização e tem papel suficiente.

Mesmo que o cliente altere o `organization_id`, a RLS deve negar acesso à organização não autorizada.

## Integrações externas

Todas ficam atrás de adapters em `src/lib/integrations` com interfaces testáveis. Nenhuma feature acessa SDK externo diretamente de componente React.

## Scheduler de lembretes

Decisão arquitetural: **não depender de Vercel Cron para os lembretes 24h/2h**. O scheduler oficial é Supabase Cron/`pg_cron`, executado a cada 5 minutos, que chama via `pg_net` o endpoint autenticado do Next.js. O segredo compartilhado fica em Vercel Environment Variables e também em Supabase Vault; nunca é escrito em migration/versionamento.

O endpoint apenas processa itens elegíveis do `whatsapp_reminder_outbox`; Twilio permanece server-side no Next.js. A máquina de estados do outbox e `unique(appointment_id, reminder_type)` garantem idempotência sob jobs sobrepostos/retries.

## Idempotência

Obrigatória em:

- criação/atualização de evento Calendar;
- envio Twilio;
- registro de pagamento;
- geração de cobrança a partir de sessão;
- finalização de sessão;
- processamento de webhook.

## Datas/fuso

- banco em `timestamptz`;
- organização guarda timezone IANA, default `America/Sao_Paulo` somente como seed/configuração, não hardcode universal;
- UI formata no timezone da organização;
- Google Calendar recebe timezone explícito quando necessário.

## Observabilidade

- request/correlation id;
- logs sem conteúdo clínico;
- external provider request id/sid/event id quando seguro;
- `audit_events` para ações sensíveis;
- erros amigáveis para UI e detalhes técnicos somente em log seguro;
- error boundaries de App Router (`error.tsx` / `global-error.tsx`) sem vazar mensagem crua na UI.

## Limites de abuso (Fase 13)

Rate limit in-memory por instância serverless, atrás da interface `RateLimiter` (`InMemoryRateLimiter` hoje): grants de captura 30/min por IP; ações de IA 20/min por organização+usuário. **Não é cota global de cluster.** Payload de webhook/JSON tem teto explícito. CSP por request com nonce em `src/proxy.ts`. Isso reduz abuso e custo; não substitui WAF nem rate limiting distribuído.

## Rollback

Procedimento em `docs/24-rollback.md`. Exportação lógica não é DR. Scheduler não usa Vercel Cron.

## Futuro Flutter

A arquitetura deve permitir futuro cliente Flutter sem refazer backend:

- Supabase continua backend;
- RLS continua enforcement;
- contratos de integrações são HTTP estáveis;
- lógica de Google/Twilio/AI permanece server-side;
- regras de domínio críticas não ficam apenas em componentes web.


## Clinical AI boundary

Antes de gravação/transcrição/IA clínica, o server resolve autorização, tenant e consent state. Qualquer capability que permita capturar áudio — incluindo o `session_capture_grant` do caminho local **ou** a signed upload capability do fallback — exige o mesmo gate server-side antes de ser emitida. No caminho local o servidor não intermedia o áudio, então o enforcement se completa na persistência: segmento de transcrição sem grant válido é recusado. Runtime prompts e contracts são fonte de verdade em `src/lib/ai/`; nenhuma saída clínica é auto-commit. A aplicação não automatiza avaliação psicológica/testes restritos, diagnóstico definitivo ou ajuste de medicação.
