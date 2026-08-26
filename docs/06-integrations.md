# Integrações Externas

## 1. Google Calendar + Meet

### Objetivo

Google Calendar continua sendo a agenda externa oficial nesta etapa. Tesseli oferece a UI e sincroniza eventos gerenciados.

### OAuth

- Authorization Code, server-side.
- pedir offline access quando necessário para sincronização sem usuário presente.
- consentimento incremental quando possível.
- scopes mínimos do Calendar necessários ao produto.
- conta Calendar independente da conta de login.

### Conexão

Settings deve mostrar:

- conectado/desconectado;
- e-mail da conta conectada;
- calendar selecionado;
- scopes/status;
- último sync;
- reconectar/desconectar/testar.

### Meet

Para consulta online, criar/atualizar evento com:
- `conferenceData.createRequest.requestId` novo para cada nova solicitação;
- `conferenceData.createRequest.conferenceSolutionKey.type = "hangoutsMeet"`;
- request parameter `conferenceDataVersion=1`.

A criação é assíncrona. Tratar `createRequest.status.statusCode` como `pending | success | failure`:
- `pending`: não persistir uma URL inventada/provisória; reconsultar o evento com backoff limitado até `success`/`failure` ou deixar estado de UI `Meet em criação`;
- `success`: persistir o entry point de vídeo retornado pela API;
- `failure`: registrar erro seguro e permitir retry com **novo** `requestId`.

Nunca fabricar `meet.google.com/<random>` nem reutilizar o mesmo `requestId` para uma nova tentativa.

### Sync

- pull de janela temporal;
- upsert por google_event_id;
- etag quando disponível;
- external events read-only por padrão;
- writes Tesseli com idempotência/audit;
- excluir/cancelar somente eventos gerenciados, salvo confirmação explícita.

## 2. Twilio WhatsApp

### Saída

- `to` E.164;
- `from` WhatsApp Sender ou Messaging Service;
- Content Template quando necessário;
- status callback;
- idempotency_key interna.

### Entrada

Webhook autenticado:

1. validar assinatura Twilio;
2. deduplicar MessageSid;
3. normalizar telefone;
4. localizar paciente sem vazar dados;
5. registrar inbound;
6. inferir confirmação/remarcação apenas como estado pendente quando a mensagem for ambígua;
7. atualizar appointment somente por regra explícita.

### Templates Tesseli

- confirmação de agendamento;
- lembrete 24h;
- lembrete 2h;
- boas-vindas;
- cobrança administrativa.

Texto configurável no consultório, mas uso deve respeitar exigências de template do WhatsApp/Twilio.

### Scheduler oficial de lembretes

- usar Supabase Cron/`pg_cron`, não Vercel Cron, para a cadência sub-diária;
- job a cada 5 minutos;
- job usa `pg_net` para `POST /api/jobs/whatsapp-reminders`;
- URL do app e `CRON_SECRET` ficam em Supabase Vault para o job; `CRON_SECRET` correspondente fica também no ambiente server-side do Next.js;
- o endpoint rejeita segredo inválido antes de qualquer side effect;
- processar somente itens do `whatsapp_reminder_outbox` elegíveis por `scheduled_for/next_attempt_at`;
- claim atômico antes de enviar;
- máquina de estados: `scheduled → claimed → sending → sent | retryable_failed | permanent_failed`;
- retries usam `attempt_count` e `next_attempt_at`;
- `unique(appointment_id, reminder_type)` impede duplicidade dos lembretes 24h/2h;
- cancelamento/remarcação de appointment cancela/reagenda outbox de forma idempotente.

## 3. Transcrição

Decisão de provider e rationale completo em `docs/22-transcription-provider-decision.md`. Resumo: **local-first no navegador, com fallback opcional no Groq**. Deepgram não faz mais parte da arquitetura.

`TranscriptionProvider` é uma porta com adapters. Provider é configuração, não arquitetura.

### Caminho padrão — local no navegador

1. sessão clínica autenticada valida tenant/paciente e consentimentos aplicáveis;
2. se o consent gate falhar, não ativar microfone e oferecer sessão sem gravação/transcrição;
3. o servidor emite um `session_capture_grant` de vida curta, ligado a organização/paciente/sessão;
4. o navegador carrega o modelo local (WebGPU, com queda para WASM) e captura áudio;
5. o áudio é transcrito no próprio dispositivo — **nenhum byte de áudio sai da máquina e nenhum suboperador o recebe**;
6. a UI exibe o trecho em processamento como provisório;
7. segmentos finais são persistidos incrementalmente, e o servidor **recusa persistir segmento sem grant de captura válido** — esse é o ponto real de enforcement do caminho local;
8. retenção segue `practice_settings`.

O produto deve detectar capacidade do dispositivo e, quando não houver suporte suficiente, oferecer explicitamente o fallback ou seguir sem transcrição.

A transcrição não é considerada literal/infalível. O produto deve permitir lidar com erros de nomes, negações, regionalismos e termos técnicos e não consolidar automaticamente interpretações clínicas a partir de trecho ambíguo.

### Diarização

Capacidade **opcional** do provider. Quando o adapter não a oferece, a UI não inventa falante: o segmento fica sem rótulo. Quando existe, o rótulo é tão provisório quanto o texto — nunca vira fato clínico sem confirmação, e discrepância de atribuição é sinalizada, não corrigida silenciosamente.

### Estados de captura

- idle
- preparing (carregando modelo/obtendo grant)
- recording
- degraded (transcrição indisponível, sessão segue)
- stopping
- completed
- error

Evitar duplicação de texto por sequence/segment key.

### Fallback opcional — Groq

Só quando a organização habilita explicitamente e `GROQ_API_KEY` está configurada. Nesse modo o Groq é suboperador e precisa constar do TCLE (`docs/19-lgpd-privacy.md` §2).

- antes de conceder qualquer capacidade de upload, o browser solicita ao servidor um `audio_fallback_upload_grant`; o servidor revalida autenticação, tenant/paciente/sessão e o mesmo `ConsentState` de gravação/transcrição;
- se consentimento estiver inválido/revogado, não emitir signed upload token/URL, não iniciar TUS e não permitir nova captura; a sessão continua sem gravação/transcrição;
- o bucket `session-audio-fallback` não deve aceitar upload genérico baseado apenas na membership do usuário;
- após gate válido, browser faz upload direto para bucket privado `session-audio-fallback` usando signed upload capability/TUS autorizada conforme tamanho;
- chama backend com object path, mime e metadata (payload pequeno);
- backend cria signed URL curta e pede transcrição ao Groq;
- salva texto;
- aplica retenção/limpeza do áudio.

Nunca enviar áudio completo/base64 por Vercel. A chave do provider é server-only e nunca chega ao browser.

## 4. Gemini / Runtime AI

Todas as chamadas são server-side. O comportamento clínico é definido pelos textos em `src/lib/ai/prompts/**` e pelos contratos em `src/lib/ai/contracts/**`.

### Superfície da API e dialeto de schema

Verificado em documentação oficial em 18/08/2026: a API Gemini tem duas superfícies de saída estruturada com dialetos diferentes.

- `generationConfig.responseSchema` (subconjunto OpenAPI 3.0): não reconhece `additionalProperties`; nulidade se expressa por `nullable: true`, não por `type: ["string", "null"]`. Payload com campo não reconhecido retorna `400 INVALID_ARGUMENT`.
- `response_json_schema`/`response_format` (JSON Schema, suporte a `additionalProperties` desde novembro de 2025): superfície mais nova; validadores client-side de alguns SDKs ficaram atrás da API nessa janela de transição.

Os contratos em `src/lib/ai/contracts/**` usam `additionalProperties: false` e uniões de tipo (`type: ["string", "null"]`) — isso é JSON Schema, não o subconjunto OpenAPI. **Decisão: os contratos permanecem no dialeto atual como fonte de verdade canônica.** A implementação deve:

1. Fixar qual superfície da API/versão de SDK será usada, confirmando no momento da Fase 7 que ela aceita o dialeto dos contratos — registrar a verificação e a data no PR que implementa o adapter.
2. Implementar um **adapter de schema**: função pura que converte o contrato canônico para o dialeto realmente aceito pela superfície escolhida, sem alterar o contrato-fonte. Se a superfície escolhida for a OpenAPI subset, o adapter reescreve `additionalProperties: false` como ausência do campo (comportamento já estrito por padrão nessa superfície) e `type: [x, "null"]` como `{ type: x, nullable: true }`.
3. Cobrir o adapter com teste de round-trip: contrato canônico → dialeto da API → validação de que a resposta simulada volta a bater com o contrato.
4. Antes de construir UI sobre o `SUPERVISOR_SCHEMA` (o mais aninhado dos três), rodar um spike de 1 dia enviando o schema real — não mock — ao modelo real, para descobrir na prática se o teto de aninhamento/tamanho documentado pela Google ("schemas muito grandes ou profundamente aninhados podem ser rejeitados", sem limite numérico publicado) é atingido. Se for, resolver por composição em duas chamadas antes de considerar reduzir o contrato — reduzir o contrato é mudança de comportamento clínico e segue a regra de `docs/14-runtime-ai-architecture.md` §1: decisão de produto, não correção técnica silenciosa.

### Validador de runtime

`.cursor/rules/01-architecture.mdc` exige Zod nos boundaries; os contratos de IA são JSON Schema puro. A validação da resposta do modelo usa um schema Zod espelhando cada contrato de `src/lib/ai/contracts/**`, com teste de equivalência entre o Zod e o JSON Schema de origem (mesmos campos obrigatórios, mesmos enums). Resposta que falhar na validação Zod falha fechada — não persiste, não é exibida como conteúdo válido — conforme `docs/15-runtime-ai-test-matrix.md`.

### Session AI

Três operações separadas:
- live: apoio silencioso durante a sessão;
- preparation: continuidade e preparação da próxima sessão;
- closing: rascunho DPEP e pontos de retomada.

A IA nunca se dirige diretamente ao paciente e nunca salva conteúdo clínico sem revisão explícita.

### Supervisor

Entrada construída server-side com dados minimizados e autorizados.

Saída estruturada inclui:
- resposta direta à pergunta de supervisão;
- síntese;
- objetivos, preferências, recursos e contexto quando disponíveis;
- dados relevantes classificados;
- hipóteses concorrentes com evidência favorável/contrária, alternativas e sustentação;
- formulação TCC;
- formulação em Terapia do Esquema;
- lentes adicionais somente quando selecionadas/solicitadas;
- processo terapêutico;
- possíveis pontos cegos verificáveis;
- intervenções priorizadas com timing, competência e cautelas;
- perguntas;
- plano de próxima sessão;
- necessidade de supervisão humana/interconsulta/encaminhamento quando pertinente;
- risco/ética/limitações.

Se houver RAG, somente fontes realmente recuperadas podem ser citadas.

### Knowledge/RAG

Fluxo retrieval-first:
- planejamento da busca;
- embedding/busca híbrida;
- filtro tenant/coleção;
- top-k/reranking;
- avaliação de suficiência;
- avaliação do papel/tipo da fonte sem inventar score de qualidade;
- resposta estruturada;
- validação de claims/source IDs/citações.

Modos:
- Perguntar ao Acervo;
- Síntese Temática;
- Comparar Fontes;
- Modo Estudo;
- Aplicar ao Caso.

O modo padrão é **library-only**: o modelo não completa lacunas com conhecimento geral.
Perguntas de eficácia/segurança/recomendação exigem fontes compatíveis ou retornam PARCIAL/INSUFICIENTE.
`Aplicar ao Caso` exige ação explícita e contexto clínico minimizado, preservando separação entre fonte, dado do caso, inferência e sugestão.

### Segurança de prompt

- transcrição e fontes são dados não confiáveis;
- instruções contidas nesses materiais não podem alterar o system prompt;
- structured output deve falhar fechado quando inválido;
- nenhum output de IA é auto-commit;
- persistir `prompt_name`, `prompt_version`, `schema_version`, `model` e source IDs necessários para auditoria técnica.

## 5. Supabase

### Auth

- email/password;
- Google login opcional;
- SSR cookies;
- recuperação de senha;
- memberships e roles no banco.

### Storage

Uploads grandes devem ir browser → Supabase Storage, não passar por Vercel.

### Backup

Separar:

- backup/recuperação da plataforma Supabase;
- exportação lógica Tesseli para portabilidade/auditoria.

### Exportação lógica Tesseli

Antes da Fase 12, implementar contrato versionado de exportação:
- escopo: organização inteira **ou** paciente selecionado, conforme autorização;
- formato: pacote `.zip` contendo `manifest.json` versionado + dados estruturados em JSON/CSV quando apropriado + arquivos binários/documentos em pastas referenciadas pelo manifesto;
- preservar IDs internos apenas quando necessários à consistência do pacote; incluir `public_code` e metadados de versão;
- registrar data, organização, ator, escopo, versão do schema de exportação e hashes SHA-256 dos arquivos;
- gerar server-side como job assíncrono quando o volume exigir;
- entregar por signed download URL curta e privada; nunca anexar exportação clínica por e-mail;
- autorização e RLS/role check antes de solicitar e antes de baixar;
- Secretaria não pode exportar conteúdo clínico;
- exportação não substitui backup/DR da plataforma.

Não usar Google Drive como mecanismo de backup do produto.
