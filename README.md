# Tesseli — Project

Este repositório define a especificação funcional, visual e técnica do **Tesseli**, o código-fonte do consultório digital **VirgíniaPsi**. A marca visível na interface é VirgíniaPsi; contratos internos, RLS e o nome do pacote podem continuar usando Tesseli. Hospedagem (GitHub / Vercel / Supabase dashboard): **Virginiapsi** — `https://github.com/claudiobr74/Virginiapsi`.

Especificação técnica atual: **v1.4**. Runtime Clinical Prompts: **v1.2.0**; structured-output contracts: **revision 1.2.1**. Ver `docs/20-preimplementation-fixes-v1.4.md` para as correções desta versão.

## Regra fundamental

A implementação deve seguir as especificações deste kit como fonte de verdade. São obrigatórios:

- identidade visual e linguagem da interface;
- nomes e objetivos dos módulos;
- fluxos funcionais definidos;
- regras de negócio;
- integrações especificadas;
- critérios de segurança, privacidade e auditoria.

Em caso de conflito entre uma decisão de implementação e este kit, **este kit vence**.

## Stack-alvo

- Next.js (App Router) + React + TypeScript strict
- Tailwind CSS
- Vercel
- Supabase: Postgres, Auth, Storage e RLS
- Google Calendar API + Google Meet via Calendar `conferenceData`
- Twilio WhatsApp
- Transcrição ao vivo via Groq (MediaRecorder + chunks), com spool criptografado e importação de gravação — ver `docs/22-transcription-provider-decision.md`
- Gemini para Supervisor Clínico IA e apoio ao módulo de Conhecimento
- Supabase pgvector para base de conhecimento/RAG local
- Playwright + Vitest + TypeScript + ESLint

## Decisões arquiteturais

Não fazem parte da arquitetura do Tesseli:

- Firebase / Firestore / Firebase Storage / Firebase Auth
- Google Drive, Google Docs ou Google Sheets como backend do produto
- NotebookLM como dependência operacional
- Express paralelo ao Next.js
- NestJS paralelo ao Next.js
- Drizzle/ORM duplicando o schema do Supabase
- JWT sintético em testes
- fallback que envia áudio em base64 pelo backend/Vercel

## Ordem de uso

1. Crie um repositório GitHub vazio para o Tesseli.
2. Copie o conteúdo deste projeto para a raiz do repositório.
3. Abra o repositório no Cursor.
4. Leia `MASTER_PROMPT.md`, `VISUAL_MASTER_PROMPT.md`, `RUNTIME_AI_PROMPTS.md` e `docs/`.
5. **Antes de qualquer implementação**, execute no Claude em Plan Mode o conteúdo de `CLAUDE_PRE_IMPLEMENTATION_REVIEW_PROMPT.md`.
6. O Claude deve produzir uma auditoria com verdict `READY`, `READY_WITH_FIXES` ou `NOT_READY` e **parar sem implementar**.
7. Corrija todos os P0/P1 de especificação; este pacote v1.4 já incorpora os achados das duas primeiras auditorias.
8. Execute novamente a auditoria e exija verdict `READY`.
9. Somente depois de `READY` + autorização explícita para iniciar, execute `prompts/00-bootstrap.md`.
10. Execute os prompts de fase por ordem. Não pule gates.
11. Nunca entregue uma fase como pronta sem rodar os testes definidos no gate.

## Estrutura Cursor

- `.cursor/rules/*.mdc`: regras persistentes.
- `.cursor/agents/*.md`: subagentes especializados.
- `.cursor/skills/*/SKILL.md`: workflows reutilizáveis.
- `docs/`: fonte de verdade funcional e técnica, incluindo orquestração de agents.
- `prompts/`: implementação faseada.
- `src/lib/ai/prompts/`: textos de atuação da IA em runtime (Sessão, Supervisor e Conhecimento).
- `src/lib/ai/contracts/`: contratos estruturados de saída da IA.
- `RUNTIME_AI_PROMPTS.md`: mapa e política de versionamento dos runtime prompts.
- `docs/17-clinical-ai-review-v1.2.md`: revisão clínica multidimensional da IA.
- `CLAUDE_PRE_IMPLEMENTATION_REVIEW_PROMPT.md`: auditoria integral obrigatória antes da Fase 0.
- `docs/18-preimplementation-fixes-v1.3.md`: registro das correções técnicas derivadas da primeira auditoria.
- `docs/19-lgpd-privacy.md`: papéis, suboperadores, retenção e fluxo de exclusão LGPD.
- `docs/20-preimplementation-fixes-v1.4.md`: registro das correções derivadas da segunda auditoria.
- `docs/24-rollback.md`: rollback de deploy Vercel e recuperação PITR/backup Supabase. Exportação lógica não é DR.
- `docs/25-release-gate.md`: checklist PASS/FAIL/EXTERNAL_BLOCKED do gate de release.
- `docs/26-go-live.md`: go-live multiusuário/multiclínicas (decisões D1–D5, inventário G0).

## Primeiro objetivo

A primeira entrega é **a auditoria pré-implementação**, não código. Após as correções v1.4, a reauditoria deve retornar `READY`. Só após `READY` e autorização explícita do usuário começa a fundação técnica, visual e de segurança. O Tesseli cresce por fatias verticais completas: UI + domínio + banco + RLS + testes + auditoria quando aplicável.

## Asset oficial da marca

A marca visível é **VirgíniaPsi**. O símbolo oficial está em `public/brand/virginia-psi-mark.png` e deve ser utilizado diretamente, sem qualquer edição. O wordmark é composto na UI (`BrandWordmark`).

## IA clínica em runtime

Os textos completos de atuação da IA fazem parte deste mesmo projeto. Leia `RUNTIME_AI_PROMPTS.md` e `docs/14-runtime-ai-architecture.md`. O Cursor implementa esses contratos, mas não deve alterar silenciosamente o comportamento clínico durante refactors.

## Execução local

Requisitos: Node.js 22+ e [pnpm](https://pnpm.io) 10.

```bash
pnpm install
cp .env.example .env.local
```

Preencha pelo menos as variáveis públicas para o app subir:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Chaves server-only permanecem vazias até as fases correspondentes. O schema Zod falha de forma explícita (sem logar valores) se um módulo servidor as exigir e elas estiverem ausentes. Não use chaves JWT legadas `anon` / `service_role`.

```bash
pnpm dev          # http://localhost:3000
pnpm lint
pnpm typecheck
pnpm test         # Vitest: env, arquitetura, contratos, componentes de UI
pnpm test:security  # migrations + RLS contra PostgreSQL real (ver abaixo)
pnpm build
pnpm scan:client-bundle  # garante que nenhum segredo server-only vaza no bundle do client
pnpm test:e2e     # Playwright: login, shell, tenancy, dark mode, design system (desktop + mobile)
```

### Suíte de segurança (RLS)

`pnpm test:security` aplica as migrations e exercita as policies contra um PostgreSQL real. Não usa Docker: o harness (`tests/security/support/`) cria os papéis `anon`/`authenticated`/`service_role` e emula o schema `auth` do Supabase (`auth.users`, `auth.uid()`, `auth.jwt()`), do mesmo modo que o PostgREST faz depois de validar o JWT. As consultas nunca rodam como superusuário ou dono das tabelas — se rodassem, a RLS seria ignorada e os testes não provariam nada.

Com PostgreSQL local (Ubuntu, sem Docker):

```bash
sudo apt-get install -y postgresql-16
sudo pg_ctlcluster 16 main start
sudo -u postgres psql -c "create role tesseli_admin login password 'tesseli' superuser createdb"
sudo -u postgres createdb -O tesseli_admin tesseli_test
pnpm test:security
```

Aponte para outra instância com `TEST_DATABASE_URL`. Na CI, o job usa o serviço `postgres:16`.

Sem um projeto Supabase real ligado, o login autenticado do Playwright usa um stub local do Auth REST (`tests/e2e/support/auth-stub-server.mjs`), iniciado automaticamente pelo `playwright.config.ts`. Ele prova a navegação/gate do shell, não segurança de RLS/JWT — os testes adversariais de auth real acontecem no gate da Fase 2, contra um Supabase real.

Supabase CLI está instalado como devDependency. Ainda não há migrations de produto (Fase 2). Para preparar o ambiente local depois da Fase 2:

```bash
pnpm exec supabase --version
pnpm exec supabase start
```

O gate base (`pnpm gate`) roda `lint && typecheck && test && test:security && build && scan:client-bundle`. `pnpm test:e2e` roda à parte. Não avance de fase sem o gate correspondente em PASS.

## Fase 1 — Design system, auth e shell

Entregue nesta fase:
- tokens Tesseli (paleta sage/bone, Inter, Playfair Display, JetBrains Mono) e dark mode automático via `prefers-color-scheme`;
- os onze primitivos canônicos de `docs/02-visual-spec.md` em `src/components/ui/` — referência mínima navegável em `/design-system`;
- login e-mail/senha + Google (Supabase Auth), recuperação e redefinição de senha, sem revelar existência de conta;
- `src/proxy.ts` (Next.js 16 renomeou `middleware.ts`) protege `/app/**` e `/session/**` e usa `auth.getUser()` (nunca decode-only) via `@supabase/ssr`;
- shell desktop (sidebar 256px) e mobile (top bar + bottom nav + drawer "Mais"), com bloqueio de tela manual e por inatividade;
- placeholders dos oito módulos, todos consumindo os primitivos canônicos.

Fora de escopo, propositalmente: Google Calendar OAuth, RLS/multi-tenant (Fase 2), e qualquer dado clínico real.

## Fase 2 — Tenancy, RBAC, RLS e auditoria

Migration `supabase/migrations/*_tenancy_core.sql`: `organizations`, `organization_members`, `practice_settings` e `audit_events`, todas com RLS habilitada.

Modelo de enforcement:
- autorização vem sempre de uma membership ativa de `auth.uid()` — nunca de um `organization_id` enviado pelo cliente e nunca de `members[0]`;
- helpers `is_org_member`, `has_org_role`, `is_psychologist_admin` e `secretary_finance_access` são `stable security definer` com `search_path` vazio, referências schema-qualified e `EXECUTE` apenas para `authenticated` (o `SECURITY DEFINER` é o que evita recursão de policy em `organization_members`);
- `anon` não recebe GRANT nenhum nas tabelas de tenant, então a negação é dupla: privilégio e linha;
- a secretaria não lê `practice_settings`, `audit_events` nem a equipe; o shell recebe apenas a projeção mínima de `public.organization_shell_settings()`;
- `secretary_finance_access` (`none`/`view`/`manage`) é resolvido no banco, base para as policies financeiras da Fase 10;
- `audit_events` é append-only: nenhum papel tem INSERT direto, UPDATE ou DELETE — a escrita passa por `public.log_audit_event()`, que força `actor_user_id = auth.uid()` e exige membership;
- organizações nascem só por `public.bootstrap_organization()`, que cria organização + membership admin + settings + evento de auditoria numa transação, e a organização sempre mantém pelo menos uma psicóloga administradora ativa.

Camada de aplicação: `requireOrgContext()` resolve a organização ativa (cookie é apenas contexto de navegação, sempre validado contra as memberships), `/onboarding` cria o primeiro consultório e `/select-organization` exige escolha explícita em caso de múltiplas memberships.

Pendente de ambiente externo (`EXTERNAL_BLOCKED`), a endereçar quando houver um projeto Supabase real: policies de Storage (buckets privados), verificação com o GoTrue real emitindo/validando JWT, e `pnpm db:types` para gerar os tipos do banco (requer Docker).

## Fase 3 — Pacientes

Migration `supabase/migrations/*_patients.sql`: `patients` (administrativo, sem nenhum campo clínico) e `patient_clinical_profile` (somente psicóloga administradora), mais `patient_code_counters` para o código público.

- `public_code` (`PAC-001`, `PAC-002`, ...) é atribuído por um trigger `BEFORE INSERT` que chama uma função `SECURITY DEFINER` com `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` — o incremento e a inserção do paciente acontecem na mesma transação, então nunca há uma corrida entre "ler o próximo código" e "gravar o paciente". Um valor de `public_code` enviado pelo cliente é sempre descartado; o código é imutável após a criação (trigger `BEFORE UPDATE` dedicado).
- `patients` tem a mesma policy de RLS para `psychologist_admin` e `secretary` (CRUD, sem DELETE físico) — a separação de acesso clínico não é feita por coluna nesta tabela porque ela **não tem nenhum campo clínico**; todo conteúdo clínico vive em `patient_clinical_profile`, que só tem policy para `psychologist_admin`, sem exceção.
- `elimination_status` só muda por `psychologist_admin`, mesmo a secretaria tendo UPDATE geral em `patients` — via trigger dedicado, não apenas RLS.
- `responsible_psychologist_user_id` é validado por trigger contra `organization_members` (precisa ser `psychologist_admin` ativo da mesma organização).
- `organization_id` de `patient_clinical_profile` é sempre derivado do paciente por trigger, nunca aceito do cliente — mesmo se a RLS de `patients` autorizasse a escrita, não dá para apontar o perfil clínico para outro tenant.

Camada de aplicação: `getPatientClinicalProfile()` só é chamada quando `role === "psychologist_admin"` — o Patient Hub nunca dispara essa query para a secretaria, então a seção "Acompanhamento" não existe no DOM (não é CSS escondendo). O DTO administrativo da secretaria é o mesmo `PatientRow` usado pela psicóloga, porque a tabela `patients` já nasceu sem campo clínico.

Testes: 14 novos testes de RLS (CRUD por papel, DELETE físico negado para todos, isolamento entre tenants, `elimination_status` restrito a admin, validação do `responsible_psychologist_user_id`, `patient_clinical_profile` negado à secretaria mesmo por ID direto e mesmo tentando forjar `organization_id`) e um bloco dedicado de concorrência do `public_code` (código do cliente descartado, imutabilidade, duas organizações com `PAC-001` independentes, 25 inserções concorrentes na mesma organização sem duplicidade). Mais 12 testes E2E (lista, busca, cadastro em 4 seções, Patient Hub, isolamento clínico da secretaria com captura de rede, arquivamento com confirmação).

UI: lista com busca e filtros por situação, cadastro/edição em 4 seções (Identificação — inclusive foto por arquivo ou câmera; Contato & Responsáveis; Atendimento & Situação; Financeiro & Termos — valor padrão + situação vigente dos termos/TCLE, com atalho para o prontuário). Patient Hub com "Dados do Paciente" e "Acompanhamento" (admin). Planos, pendências, extrato, documentos e TCLE ficam no hub.

Durante a fase corrigimos também um bug de regressão no primitivo `Button`: `asChild` quebrava com o Radix `Slot` sempre que `isLoading` era `false`, porque o spinner condicional virava um segundo nó filho mesmo renderizando `null`. Guardado por teste de unidade (`tests/components/button.test.tsx`).

## Fase 4 — Agenda + Google Calendar + Meet

Migration `supabase/migrations/*_google_calendar.sql`: `google_calendar_connections` (metadados não sensíveis — status, e-mail, calendário selecionado, último sync), `google_calendar_credentials` (tokens criptografados), `appointments` e `calendar_sync_events` (auditoria de sync, sem conteúdo clínico).

- `google_calendar_credentials` tem RLS habilitada e **nenhuma policy** — nenhum papel, nem a psicóloga administradora que conectou a conta, tem `GRANT` na tabela via Data API. O único acesso é por `SECURITY DEFINER`: `upsert_google_credentials()`/`disconnect_google_calendar()` exigem `is_psychologist_admin`, `get_google_credentials()` exige apenas `is_org_member` (o valor retornado continua criptografado — só o Node do servidor, com `GOOGLE_TOKEN_ENCRYPTION_KEY`, consegue decifrar).
- Conectar/desconectar o Google é ação de admin; **selecionar** qual calendário já conectado usar fica aberto aos dois papéis (linha "calendar sync: CRUD para os dois papéis" da matriz de RBAC), porque isso é operação do dia a dia da Agenda, não gestão da integração em si.
- `appointments.origin` distingue `TESSELI` (gerenciado, bidirecional) de `GOOGLE_EXTERNAL` (importado, somente leitura). As policies de INSERT/UPDATE/DELETE só autorizam linhas `TESSELI` — um evento externo nunca é editável por escrita direta de nenhum papel. O pull-sync usa `upsert_external_appointment()` (`SECURITY DEFINER`, upsert por `organization_id + google_calendar_id + google_event_id`), que já nasce com `origin = 'GOOGLE_EXTERNAL'` e ignora silenciosamente qualquer tentativa de sobrescrever uma linha `TESSELI` com o mesmo id externo.
- `create_idempotency_key` (único por organização) evita duplicar uma consulta em caso de duplo clique/retry na criação.
- `calendar_sync_events` é append-only como `audit_events`: sem policy de escrita para nenhum papel, só `log_calendar_sync_event()`; a leitura é restrita à psicóloga administradora.

Adapters em `src/lib/integrations/google/` (sem a SDK `googleapis` — um cliente REST fino sobre `fetch`, injetável para testes com mocks estritos de HTTP, como pede `docs/07-test-strategy.md`):
- `oauth.ts`: `state` assinado por HMAC-SHA256 e ligado a `organizationId`/`userId`/expiração; troca de código e refresh de token; escopos mínimos do Calendar.
- `crypto.ts`: tokens armazenados com AES-256-GCM (IV aleatório por valor, autenticado).
- `calendar-client.ts`: `listCalendars`/`listEvents`/`insertEvent`/`patchEvent`/`getEvent`/`deleteEvent`.
- `meet.ts`: `conferenceData.createRequest` sempre com `conferenceSolutionKey.type="hangoutsMeet"`, `conferenceDataVersion=1` e um `requestId` novo a cada tentativa; trata `pending → success|failure` reconsultando com backoff limitado; **nunca** persiste uma URL fabricada — `pending`/`failure` nunca produzem `meet_url`, e um `success` sem `entryPoints` de vídeo é tratado como `pending`, não como sucesso fajuto.

UI da Agenda (`src/features/calendar/`): visões dia/semana/mês (`AgendaBoard`), criação/remarcação com detecção de conflito (aviso + "Agendar mesmo assim"), drawer de detalhes com confirmar/remarcar/cancelar, botão "Criar Meet" (desabilitado até a consulta estar sincronizada com o Google) e página dedicada `/app/agenda/connect` para conectar, escolher calendário, sincronizar e desconectar.

**`EXTERNAL_BLOCKED`**: a troca real de código OAuth com `accounts.google.com`/`oauth2.googleapis.com` não é testável neste ambiente sem um projeto Google Cloud e credenciais reais (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`). Coberto até onde dá sem credenciais: todos os testes de contrato dos adapters (assinatura/verificação de `state`, shape das requisições REST, `hangoutsMeet`/`conferenceDataVersion=1`/`requestId` novo, estados `pending`/`success`/`failure`, nunca fabricar URL) rodam com `fetch` mockado e passam localmente; a RLS de `google_calendar_credentials`/`google_calendar_connections`/`appointments`/`calendar_sync_events` roda contra PostgreSQL real; e o E2E cobre toda a Agenda (dia/semana/mês, CRUD de evento gerenciado, conflito, evento externo somente leitura, página de conexão) usando o stub — só o clique real em "Conectar com o Google" contra o Google de verdade fica pendente de um projeto Supabase/Google reais.

Testes: 15 novos testes de RLS (`tests/security/google-calendar.test.ts`), 30 testes de contrato dos adapters Google (`tests/integrations/`), 11 testes de utilitário de fuso horário/janela de agenda (`tests/utils/`) e 7 novos testes E2E (`tests/e2e/agenda.spec.ts`).

## Fase 5 — Meu Dia

Dashboard operacional em `/app`, no lugar do placeholder da Fase 1.

- Saudação personalizável (`practice_settings.greeting_prefix` + nome da profissional) e frase curta (`quote`), expostas na projeção mínima `organization_shell_settings()` — não são dados administrativos/financeiros, então a secretaria também lê.
- Card de **próxima sessão** (primeira consulta gerenciada do dia que ainda não terminou), com horário em tabular/mono, modalidade, confirmação, deep-link de **lembrete WhatsApp** (`wa.me` com texto administrativo, sem conteúdo clínico) e **Meet** quando `meet_status = success`.
- Linha do tempo de hoje (somente `origin = TESSELI`; eventos Google externos continuam na Agenda).
- Tarefas operacionais em `practice_tasks` (CRUD dos dois papéis, `created_by_user_id` forçado para `auth.uid()`).
- **Sessões a finalizar**: rascunhos e sessões em andamento, com atalho para `/session/{id}` (só a psicóloga consulta; a secretária vê a seção vazia). **Pendências financeiras** (Fase 10) e **documentos recentes** (Fase 9) apontam para os módulos reais — sem mock de domínio.

O envio Twilio/outbox de lembretes chega na Fase 11: o botão de WhatsApp desta fase permanece o entry point administrativo (deep-link) e os lembretes 24h/2h passam pelo outbox.

Testes: RLS de `practice_tasks` + projeção de saudação (`tests/security/practice-tasks.test.ts`), contratos de `selectNextSession`/`buildWhatsAppReminderUrl` (`tests/utils/myday.test.ts`) e E2E do dashboard (`tests/e2e/myday.spec.ts`).

## Fase 5.5 — Consentimentos mínimos

Pré-requisito da Fase 6: sem esta base, o `ConsentState` da sessão clínica seria mock. Escopo reduzido de propósito — o TCLE completo (templates, PDF, assinatura, `consent_files`) continua na Fase 9.

Migration `supabase/migrations/*_consents.sql`:
- `consents` com o vocabulário completo de `type`, mas só `ai_processing`, `session_recording` e `session_transcription` são consumidos aqui.
- **Sem policy de DELETE para ninguém**: revogar é transição de status, nunca apagamento — um consentimento que existiu e foi retirado é parte do histórico. Trigger também impede reativar um consentimento revogado (registre um novo) e congela `patient_id`/`type`/`version` após o aceite.
- Autoria e data do aceite/revogação vêm de `auth.uid()`/`now()` por trigger; um `accepted_by` enviado pelo cliente é descartado — consentimento com autoria forjável não serve como evidência.
- Leitura: `psychologist_admin` vê tudo; a secretaria só vê os tipos administrativos (`service_terms`, `whatsapp`), espelhando a linha "documents: secretary somente `administrative`" da matriz de RBAC. A classificação falha fechada: o que não é explicitamente administrativo conta como clínico.
- `accepted_ip_hash` guarda hash, nunca o IP bruto.

Resolução do `ConsentState` (`src/features/consents/contracts.ts`, puro e testável sem banco), exatamente na forma de `docs/16-runtime-ai-data-contracts.md`. Regras de menor de idade: autorização do responsável exigida para todo menor; anuência formal exigida do adolescente (12–17, split do ECA). **Data de nascimento ausente falha fechada** — sem ela não dá para saber se o paciente é menor, e gravar um menor sem autorização é exatamente o dano que este gate existe para evitar.

O gate de capability (`src/lib/consent/capability-gate.ts`) é o ponto único por onde passam as duas capabilities de captura — o grant de captura de sessão e o signed upload grant do fallback —, ambas exigindo o mesmo consentimento de gravação **e** transcrição. As rotas `/api/session-capture/grant` e `/api/session-capture/upload-grant` já negam (403) sem ativar microfone nem tocar em provider nenhum; a emissão em si é da Fase 6 e o caminho liberado responde 501 em vez de devolver credencial fabricada. Um teste de arquitetura falha se uma rota nova sob `session-capture/` esquecer o gate.

Recusa não vira "resistência": o `ConsentState` exposto é só booleano/versão/data — não existe campo narrativo de motivo que pudesse viajar para a formulação clínica (`docs/17-clinical-ai-review-v1.2.md` §3.14), e há teste de contrato sobre a forma do DTO.

Testes: 8 de RLS (`tests/security/consents.test.ts`), 20 de resolução/gate (`tests/utils/consent-state.test.ts`) e 5 E2E (`tests/e2e/consents.spec.ts`) que provam negação sem consentimento, liberação após registro, novo bloqueio após revogação e negação por papel.

## Fase 6 — Sessão Clínica + Prontuário + Transcrição + Session AI

A maior fase até aqui: sessão clínica ativa, DPEP, área de trabalho clínico separada, transcrição Groq ao vivo e as três operações de Session AI (live/preparação/encerramento) via Gemini.

Migration `supabase/migrations/*_clinical_sessions.sql`: `clinical_sessions`, `session_dpep`, `session_clinical_working_notes`, `session_transcript_segments`, `session_transcript_artifacts`, `ai_runs`, `ai_artifacts` + bucket privado `session-audio-fallback`.

- **RLS**: as sete tabelas são `psychologist_admin`-only (sem exceção para a secretaria, inclusive em `clinical_sessions` — a linha "session DPEP/working notes/transcripts/supervisor-AI: NENHUM para secretary" da matriz de RBAC se estende ao envelope inteiro da sessão). Sem `DELETE` em nenhuma: sessão vira `canceled`, nunca some; segmento de transcrição e `ai_artifacts` são histórico.
- **Concorrência otimista**: `clinical_sessions.version` é o contador único que cobre DPEP **e** área clínica juntos (não um por tabela) — qualquer escrita de conteúdo clínico bumpa a mesma versão. `save_session_dpep()`/`save_session_working_notes()` fazem compare-and-bump atômico via `SECURITY INVOKER` (a RLS de quem chama já autoriza a escrita; a função só soma o passo atômico) e devolvem zero linhas em conflito — a action do Next.js traduz isso em 409 para a UI. Duas abas testadas em `tests/e2e/session.spec.ts` provam o conflito de verdade.
- **Finalização idempotente**: `finalize_clinical_session()` guarda a `finalization_idempotency_key`; repetir a chamada com a mesma chave é no-op bem-sucedido, com chave diferente numa sessão já finalizada não reabre nem duplica nada.
- `ai_artifacts.structured_content` é imutável após criado (trigger recusa `UPDATE` no conteúdo); só o ciclo de revisão (`review_status: pending → appended|discarded`, `reviewed_by`/`reviewed_at` carimbados por `auth.uid()`/`now()`) pode mudar — nenhum resultado de IA vira prontuário sem essa ação explícita.

Consent gate completo (fechando o que a Fase 5.5 deixou como stub 501): `src/lib/consent/capture-grant.ts` assina/verifica um `session_capture_grant`/`audio_fallback_upload_grant` via HMAC-SHA256, com TTL de 4h. `/api/session-capture/transcribe-chunk` é o ponto de enforcement do caminho ao vivo: recusa transcrever sem grant, RBAC clínico e sessão do paciente. A importação usa um bucket sem **nenhum** `GRANT` para `anon`/`authenticated` em `storage.objects` — só o client de service-role emite o signed upload URL, e só depois do mesmo gate.

Transcrição (`docs/22-transcription-provider-decision.md` v1.7, `docs/27-transcription-v3-cross-platform.md`):
- **Ao vivo**: MediaRecorder com negociação de MIME, chunks ~15 s, `POST /api/session-capture/transcribe-chunk`, Groq `whisper-large-v3-turbo`, persistência de texto, ACK. Sem Storage no caminho live.
- **Offline**: fila em memória + spool AES-GCM no IndexedDB; recuperação após reconectar; UI só confirma depois do ACK.
- **Importação**: file picker / drag-and-drop → Storage privado temporário → Groq → apagar objeto.
- Nenhum adapter oferece diarização — não é inventado rótulo de falante.
- ASR local (ONNX/Transformers.js/WebGPU) foi removido do app. `docs/23` permanece histórico.

Integração Gemini (`src/lib/integrations/gemini/`, `src/lib/ai/`): cliente REST fino (`x-goog-api-key`, nunca a chave na URL) contra `generateContent`. Superfície de saída estruturada fixada em `responseJsonSchema` (não o antigo `responseSchema`/subconjunto OpenAPI) — verificado em `ai.google.dev/gemini-api/docs/structured-output` e no anúncio de Structured Outputs do Google AI em 20/08/2026: essa superfície já aceita nativamente `additionalProperties` e `type: [x, "null"]`, o mesmo dialeto dos contratos em `src/lib/ai/contracts/**`, então o adapter de schema (`src/lib/ai/schema-adapter.ts`) é um pass-through estrutural, não uma reescrita de keywords — o spike de composição em duas chamadas fica reservado para o `SUPERVISOR_SCHEMA`, mais aninhado, na Fase 7. Validadores Zod em `src/lib/ai/validators/session.ts` espelham campo a campo e enum a enum os três contratos (`tests/contracts/session-validators.test.ts` prova a equivalência e testa fail-closed: campo extra, `maxItems` estourado e severidade fora do enum canônico são todos rejeitados sem persistir nada).

As três operações de Session AI (`src/features/sessions/ai/`) passam por um gate de consentimento específico (`aiProcessingAllowed`; live e closing também exigem `transcriptionAllowed`, porque consomem a transcrição), montam o DTO minimizado com contexto delimitado (`packContext` — `CONSENT_STATE`/`PATIENT_CONTEXT`/`TRANSCRIPT_WINDOW`/etc., nunca concatenado sem rótulo), chamam o Gemini server-side com os prompts de `src/lib/ai/prompts/**` inalterados, validam a resposta e persistem metadata (`ai_runs`) + rascunho (`ai_artifacts`, sempre `pending`). Só a ação explícita "Usar no DPEP" (`appendClosingArtifactToDpep`) copia `dpepDraft` para `session_dpep` — pelo mesmo caminho de concorrência otimista de uma edição manual.

UI (`src/app/session/[sessionId]/`, sem `<AppShell>` — rota distraction-free): cabeçalho compacto (paciente, horário, status, Finalizar), DPEP e área de trabalho clínico em formulários separados visualmente, painel de transcrição com estados `idle/preparing/recording/degraded/stopping/completed/error`, painel de Session AI com revisão humana antes de qualquer gravação, e wizard de finalização que encerra a sessão e dispara cobrança idempotente (Fase 10) ou consumo de pacote. Entry points: "Iniciar sessão" no Patient Hub (lista o histórico de sessões) e no drawer de detalhes da Agenda (só para `psychologist_admin`, e só quando a consulta já tem paciente vinculado).

**`EXTERNAL_BLOCKED`**: chamadas reais ao Groq (crédito de verdade) e validação em Android Chrome / Safari iOS reais permanecem `NOT_VERIFIED` até teste manual. Adapters Groq são cobertos por teste de contrato com `fetch` mockado e E2E com stub. ZDR Groq: **NOT_VERIFIED**.

Testes da sessão: RLS/concorrência em `tests/security/clinical-sessions.test.ts`, unitários de grant/MIME/spool/transport/Groq, E2E em `tests/e2e/session.spec.ts` e `tests/e2e/session-transcription.spec.ts` (Chromium desktop/mobile; WebKit no spec de transcrição).

### Isolamento e regressão de áudio

COEP/COOP e ONNX WASM **não** fazem mais parte da transcrição. Headers globais incluem `Permissions-Policy` com `microphone=(self)`.

- O browser chama só `/api/session-capture/*`; nunca `api.groq.com`.
- Chunks ao vivo não passam por Supabase Storage (`tests/architecture/forbidden-dependencies.test.ts`).
- `pnpm scan:client-bundle` recusa nomes de env Groq no client build.

## Fase 7 — Supervisor Clínico IA

Reflexão estruturada, hipóteses concorrentes, formulação TCC/Terapia do Esquema e plano — sempre com revisão humana e sem tabela nova: `ai_runs`/`ai_artifacts` da Fase 6 já eram desenhados para isso (ver o comentário no topo daquela migration). A migration desta fase só amplia o vocabulário de `purpose`/`type` para aceitar `'supervisor'`, mantendo os valores da Fase 6 válidos (`tests/security/supervisor-ai.test.ts`).

- Gate de consentimento próprio (`src/features/supervisor/gate.ts`): exige só `aiProcessingAllowed` — o Supervisor lê DPEP e área de trabalho clínico já registrados, nunca transcrição bruta, então não precisa do consentimento de transcrição que a Sessão ao vivo/encerramento exigem.
- `src/features/supervisor/dto.ts` monta o `SupervisorInput` de `docs/16-runtime-ai-data-contracts.md` com o mesmo `packContext` da Fase 6 (agora compartilhado em `src/lib/ai/context-packer.ts`, em vez de duplicado por feature) — lentes adicionais e raciocínio diagnóstico só entram no payload quando explicitamente marcados pela psicóloga.
- Validador Zod (`src/lib/ai/validators/supervisor.ts`) espelha `SUPERVISOR_SCHEMA` campo a campo (`tests/contracts/supervisor-validators.test.ts` prova a equivalência e o fail-closed em campo extra/enum fora do canônico).
- UI (`/app/supervisor`, tela editorial de duas colunas, não chat): coluna de configuração com paciente (via `?patientId=` ou seletor), sessões finalizadas selecionáveis, objetivo, pergunta clínica, abordagem principal, lentes adicionais, contexto opcional e toggle de raciocínio diagnóstico, com "Ver dados enviados à IA" antes de consultar; coluna de resultado com síntese, hipóteses e sustentação, intervenções priorizadas, perguntas, plano de próxima sessão, alerta de supervisão humana e limitações; histórico de supervisões anteriores; "Anexar à área de trabalho clínico" grava síntese/hipóteses selecionadas na sessão escolhida pelo mesmo caminho de concorrência otimista de uma edição manual — nunca automático.

### `EXTERNAL_BLOCKED` — spike do `SUPERVISOR_SCHEMA` real

`docs/06-integrations.md` §4 exige um spike de 1 dia enviando o `SUPERVISOR_SCHEMA` real (não mock) ao modelo real antes de construir UI sobre ele, para verificar na prática o teto de aninhamento/tamanho da superfície `responseJsonSchema`. **Este ambiente não tem uma `GEMINI_API_KEY` real** — os valores injetados são placeholders de CI (`'ci'`), confirmados antes de tentar a chamada. O spike fica pendente de credenciais reais; até lá:
- o schema já passa pelo mesmo adapter pass-through validado na Fase 6, e é estruturalmente comparável em profundidade aos exemplos que a documentação oficial do Google confirma suportados (arrays de objetos aninhados, 2-3 níveis) — não há motivo concreto para suspeitar de rejeição, mas isso não substitui a verificação real;
- se a chamada real rejeitar por tamanho/aninhamento em produção, a correção é compor em duas chamadas (ex.: formulação/hipóteses numa, plano/competência/risco na outra) e fazer merge antes da validação Zod — nunca reduzir o contrato, que é decisão de produto (`docs/14-runtime-ai-architecture.md` §1).

Testes: 3 novos de segurança (`tests/security/supervisor-ai.test.ts`), 12 unitários/contrato (validador+equivalência, composição de prompt, DTO), e 5 E2E (`tests/e2e/supervisor.spec.ts`) cobrindo seletor de paciente, configuração com sessão finalizada, preview de dados enviados, negação pelo gate de consentimento (sem tocar a IA real) e bloqueio da secretaria. A chamada real ao Gemini permanece `EXTERNAL_BLOCKED`, como na Fase 6.

## Fase 8 — Conhecimento Tesseli / RAG local

Acervo teórico privado com RAG retrieval-first: coleções, fontes com metadados bibliográficos, extração de texto, chunking, embeddings via pgvector, e os cinco modos (Perguntar ao Acervo, Síntese Temática, Comparar Fontes, Modo Estudo, Aplicar ao Caso). Library-only por padrão — dado de paciente nunca entra na biblioteca, e o modo padrão nunca completa lacunas com memória geral do modelo.

Migration `supabase/migrations/*_knowledge_rag.sql`:
- `create extension vector` + `knowledge_collections`, `knowledge_sources` (metadados bibliográficos — todos nullable/lista vazia por padrão, nunca inventados), `knowledge_documents` (texto extraído, separado da fonte para que reprocessar nunca toque a citação), `knowledge_chunks` (append-only: sem `UPDATE`, só `INSERT`/`DELETE` — reingestão substitui o conjunto todo) e `knowledge_embeddings` (`vector(768)`, índice `hnsw`/`vector_cosine_ops`).
- **`vector(768)`**: os modelos de embedding do Gemini têm 3072 dimensões por padrão, mas a documentação oficial recomenda truncar via `outputDimensionality` para 768/1536/3072 "com pouca perda de qualidade" — 768 é o menor recomendado, mantendo índice e custo de consulta baixos para uma biblioteca de um único tenant por vez.
- Toda tabela é `psychologist_admin`-only (mesma linha "knowledge clinical: CRUD/NENHUM" da matriz de RBAC).
- `match_knowledge_chunks()` é a única forma de rodar a busca vetorial: `SECURITY INVOKER` (a RLS de quem chama autoriza a leitura; a função só adiciona o `ORDER BY`/`LIMIT` do pgvector que um filtro PostgREST não expressa) — e usa `operator(public.<=>)` explicitamente, porque `set search_path = ''` (o padrão de segurança deste projeto) impede resolver o operador `<=>` sem qualificação.
- Bucket `knowledge-sources`: diferente do `session-audio-fallback` (Fase 6), aqui uma **policy de RLS direta** é a ferramenta certa — não há gate de consentimento adicional a impor, só "é a psicóloga administradora da organização citada no primeiro segmento do path" (`knowledge-sources/{organization_id}/{source_id}/{arquivo}`), exatamente o que RLS resolve nativamente via `storage.foldername()`.

Pipeline de ingestão (`src/features/knowledge/ingestion.ts`): download do Storage (com a própria sessão RLS-autorizada do admin, sem service-role) → extração de texto (`pdf-parse` para PDF, leitura direta para `.txt`/`.md`) → metadados de catalogação via Gemini (`KNOWLEDGE_INGESTION_PROMPT`, sempre `null`/lista vazia quando ausente — nunca inventado; falha aqui não aborta o pipeline, é só conveniência de catalogação) → chunking por tamanho fixo com sobreposição (`src/lib/knowledge/chunking.ts`, quebra preferencialmente em fronteira de parágrafo/frase) → embeddings em lote (`RETRIEVAL_DOCUMENT`) → `ready`, ou `failed` com mensagem genérica (nunca o erro bruto do provider/banco).

Retrieval (`src/features/knowledge/retrieval.ts`) é híbrido de propósito: embedding da pergunta (`RETRIEVAL_QUERY`) + `match_knowledge_chunks` (vetor, tenant-scoped) unidos com uma passada lexical simples (`ILIKE` sobre os termos da pergunta) — um termo técnico curto que a similaridade vetorial rankeia baixo ainda aparece. Cada chunk retorna com metadados da fonte (título, autor, ano, papel/tipo), nunca só um id solto.

As cinco operações (`src/features/knowledge/actions.ts`) usam o padrão run→artifact da Fase 6/7 (`ai_runs`/`ai_artifacts`, vocabulário `purpose`/`type` ampliado de novo pela migration desta fase) e um **validador de citações fail-closed** (`src/features/knowledge/citation-validator.ts`): qualquer `sourceId` citado que não esteja entre os chunks realmente recuperados nesta chamada é tratado como saída malformada — a execução falha, nada é persistido, condizente com "resposta malformada falha fechada" (`docs/15-runtime-ai-test-matrix.md`). `Aplicar ao Caso` passa pelo mesmo gate de consentimento (`aiProcessingAllowed`) do Supervisor antes de tocar qualquer dado de paciente, e nunca ingere esse dado na biblioteca.

UI (`/app/knowledge`): coluna de coleções/fontes (upload direto do navegador para o Storage usando a própria sessão do admin — sem passar payload grande pelo Next.js/Vercel) e painel principal com abas para os cinco modos, preview e resultado estruturado (evidência, síntese, citações, divergências, aplicabilidade clínica quando habilitada, limitações).

**`EXTERNAL_BLOCKED`**: chamadas reais ao Gemini (geração estruturada e embeddings) não são exercidas neste ambiente — mesma situação das Fases 6/7. Os adapters (`GeminiEmbeddingsClient`) são cobertos por teste de contrato com `fetch` mockado, incluindo fail-closed em contagem/dimensionalidade inesperada de embeddings.

Testes: 7 novos de segurança (`tests/security/knowledge.test.ts`, incluindo `match_knowledge_chunks` filtrando por organização e a policy de Storage), unitários de chunking/validador de citação/cliente de embeddings (`tests/utils/`, `tests/integrations/`), 2 de equivalência Zod↔JSON Schema (`tests/contracts/knowledge-validators.test.ts`), e 5 E2E (`tests/e2e/knowledge.spec.ts`) cobrindo bloqueio da secretaria, criação de coleção, upload real de fonte até aparecer na lista, e negação do Aplicar ao Caso pelo gate de consentimento sem tocar a IA real.

## Fase 9 — Documentos + TCLE

Templates, editor com variáveis, versionamento imutável, PDF, anexos do paciente e o TCLE completo (texto, aceite eletrônico, revogação, histórico e PDF-prova) — tudo com visibilidade por `sensitivity` (`administrative` | `clinical`) e Storage privado.

Migration `supabase/migrations/*_documents_tcle.sql`:
- `document_templates`, `documents`, `document_versions` (append-only), `document_files`, `patient_attachments`, `consent_files`.
- **Derivação e imutabilidade de `sensitivity`**: `laudo|relatorio|atestado|encaminhamento` nascem `clinical`; `recibo` nasce `administrative`; `tcle|contrato|declaracao|branco|outro` exigem escolha explícita. Depois de criado, nem a admin reclassifica — correção é cancelar e emitir outro (trigger, não só convenção).
- **Sem DELETE em `documents`**: o fato é cancelado (`canceled_at`), nunca apagado. Versões e arquivos gerados também não têm `UPDATE`/`DELETE`.
- RLS: psicóloga administradora vê tudo do tenant; secretaria só vê/edita `administrative`. `consent_files` espelha o split administrativo/clínico de `consents` via `consent_type_is_administrative`. Isolamento cross-tenant vale mesmo com UUID direto.
- Buckets `clinical-documents`, `patient-attachments` e `consents`: **zero GRANT genérico** para `anon`/`authenticated` (mesmo desenho do `session-audio-fallback` da Fase 6). Autorização depende de `sensitivity`/tipo de consentimento, que o Storage RLS não expressa bem por join — todo upload/download passa por signed URL (TTL 120s) emitida pelo client de service-role **depois** da checagem de papel+sensitivity em TypeScript (`src/lib/documents/storage.ts`, consumidor excepcional documentado no teste de arquitetura).

PDF (`pdf-lib`, sem Google Docs/Drive e sem Chromium headless): geração serverless-friendly a partir do corpo em texto puro. Substituição de variáveis (`{{patient.full_name}}`, `{{professional.name}}`, `{{date.today}}`, …) é texto puro — placeholder sem valor correspondente permanece visível, nunca some em silêncio. Cada arquivo gravado leva `sha256` na linha de metadados.

TCLE (`src/features/consents/tcle-content.ts`): rascunho estrutural cobrindo o mínimo de `docs/19-lgpd-privacy.md` §7 (suboperadores, transcrição local vs fallback, apoio de IA, prazos de guarda, direitos do titular). **Validação jurídica humana obrigatória** antes do primeiro uso com paciente real — o aviso aparece na UI. Aceite registra `consents` + PDF em `consent_files` na mesma action; bump de `TCLE_VERSION` marca aceites anteriores como desatualizados (consentimento de um texto antigo não vale para o texto novo).

UI: módulo `/app/documents` (modelos + lista), editor em `/app/documents/[id]` (rascunho → emitir PDF → baixar por signed URL), painéis de documentos/anexos/TCLE no Patient Hub, e “Documentos recentes” no Meu Dia.

**`EXTERNAL_BLOCKED`**: signed URLs de verdade contra um projeto Supabase (GoTrue + Storage) — o stub de E2E cobre o fluxo de UI (upload/download/emissão) mas não replica a RLS de Storage; essa fronteira é a suíte `pnpm test:security` contra PostgreSQL real (INSERT direto em `storage.objects` negado) e fica pendente de um projeto Supabase real para o round-trip HTTP do signed URL.

Testes: RLS de sensitivity/imutabilidade/isolamento de tenant/append-only/buckets (`tests/security/documents.test.ts`), unitários de template/PDF/TTL/path/sha256 e resolução do TCLE (`tests/utils/document-*.test.ts`, `tests/utils/tcle.test.ts`), e E2E (`tests/e2e/documents.spec.ts`) cobrindo emissão de PDF, papel da secretaria (só administrativo, 404 em documento clínico mesmo com o URL), anexos e aceite/revogação do TCLE.

## Fase 10 — Financeiro

Subabas **Hoje**, **Recebimentos**, **Despesas** e **Relatórios**. Valores em `numeric(12,2)` no Postgres e **centavos inteiros** na aplicação (`src/lib/finance/money.ts`) — 0,10 + 0,20 = 0,30, sem IEEE-754.

Migration `supabase/migrations/*_finance.sql`:
- `financial_plans`, `financial_charges`, `financial_payments`, `financial_expenses`, `financial_plan_movements`, `financial_closings`.
- Helpers `can_read_finance` / `can_write_finance` sobre `secretary_finance_access(org_id)` (`none` / `view` / `manage`; admin sempre `manage`).
- **Sem GRANT DELETE** em fato financeiro: cancelamento, estorno (`voided_at`) e `refunded` preservam histórico. Status da cobrança deriva da soma dos pagamentos não anulados.
- Unicidade parcial `(organization_id, session_id)` e RPC `create_session_charge` tornam a finalização de sessão → cobrança **idempotente**. Pacote pré-pago/pós-pago ativo **consome** movimento em vez de gerar avulsa; mensalidade cobre o período.
- Período fechado (`financial_closings`) bloqueia INSERT/UPDATE de fatos na competência.

UI: `/app/finance` (baixa rápida, recibo individual/lote via documentos `recibo` da Fase 9, CSV configurável, fechamento mensal, NFS-e só como solicitação administrativa). Controle de `secretary_finance_access` no próprio módulo (admin). Patient Hub (planos, pendências, extrato) e Meu Dia (pendências do dia).

Testes: aritmética em centavos (`tests/utils/money.test.ts`), CSV (`tests/utils/finance-csv.test.ts`), RLS none/view/manage + isolamento + overpay + período fechado + sem hard delete (`tests/security/finance.test.ts`), E2E (`tests/e2e/finance.spec.ts`).

## Fase 11 — Twilio WhatsApp

Migration `supabase/migrations/*_whatsapp.sql`:
- `communication_preferences` (ativar exige consentimento `whatsapp` aceito), `whatsapp_templates`, `whatsapp_reminder_outbox` com `unique(appointment_id, reminder_type)`, `whatsapp_messages` (idempotency_key) e `whatsapp_inbound_messages` (`message_sid` unique).
- Outbox com claim atômico (`FOR UPDATE SKIP LOCKED`), estados `scheduled|claimed|sending|sent|retryable_failed|permanent_failed|canceled` e retries com backoff.
- Trigger na agenda enfileira/cancela lembretes 24h/2h; preferência sincroniza a fila do paciente.
- Scheduler: `pg_cron` a cada 5 min → `invoke_whatsapp_reminder_job()` lê Vault (`tesseli_app_url`, `tesseli_cron_secret`, **sem valores na migration**) → `pg_net` POST `/api/jobs/whatsapp-reminders`. O endpoint valida `CRON_SECRET` (`x-cron-secret` ou Bearer) **antes de qualquer side effect**.
- Adapter Twilio via `fetch` (sem SDK no client). Webhooks de status/inbound só processam após HMAC-SHA1 da assinatura Twilio. Parser inbound conservador: só `SIM`/`confirmo` confirma a consulta; remarcação/cancelamento ficam pendentes.

UI: painel WhatsApp no Patient Hub (consentimento, ativar canal, confirmação/boas-vindas/cobrança, modelos, outbox). Meu Dia mantém o deep-link `wa.me` como atalho administrativo.

Testes: E.164/assinatura/status/parser (`tests/utils/*` + `tests/integrations/twilio-client.test.ts`), RLS/consentimento/claim concorrente/retry/Vault (`tests/security/whatsapp.test.ts`), E2E de preferência + rejeição de CRON_SECRET/assinatura (`tests/e2e/whatsapp.spec.ts`).

## Fase 12 — Configurações, diagnósticos e portabilidade

Migration `supabase/migrations/*_settings_backup.sql`:
- `logical_exports` (escopo organização ou paciente, status `queued|packing|ready|failed|expired`, hashes SHA-256, sem DELETE). RLS admin-only.
- Bucket privado `tesseli-exports` (zero GRANT genérico; download por signed URL curta depois do check de papel).
- RPCs `list_organization_members` / `invite_organization_member` (e-mail em `auth.users`; convite só se a pessoa já tiver conta).
- Job de retenção do áudio de fallback: `purge_expired_fallback_audio()` (service_role) + `pg_cron` diário `0 3 * * *` → Vault → `pg_net` POST `/api/jobs/audio-retention` (mesmo `tesseli_app_url` / `tesseli_cron_secret` da Fase 11, **sem valores na migration**). O endpoint valida `CRON_SECRET` antes de qualquer side effect.
- Fluxo LGPD: relatório do que elimina vs retém + frase `ELIMINAR PERMANENTEMENTE PAC-###`; anonimiza identificadores; prontuário/financeiro/consentimentos ficam com `elimination_retained_reason`.

UI `/app/settings` (secretaria redirecionada): Meu Perfil, Consultório, Aparência, Segurança, Equipe e Acessos, Integrações (status real sem secrets), Backup e Recuperação (DR = backup Supabase; exportação lógica ZIP versionada), Zona de Risco.

Testes: consistência ZIP/hashes e diagnósticos sem vazamento (`tests/utils/export-pack.test.ts`, `tests/utils/integration-diagnostics.test.ts`, `tests/utils/elimination.test.ts`), RLS/retenção/equipe (`tests/security/settings.test.ts`), E2E das oito seções + exportação + confirmação destrutiva + job 401 (`tests/e2e/settings.spec.ts`).

## Fase 13 — Hardening e deploy

Não declara o produto release-ready. O Preview da Fase 13 responde `GET /login` 200 (preset Next.js no `vercel.json`). O `main` antigo em `serena-psi-beta` continua 404. Remetente Twilio, restore PITR real e validação jurídica permanecem EXTERNAL_BLOCKED (`docs/25-release-gate.md`).

Entregue no código:

- Error boundaries e 404 com primitivos canônicos (`src/app/error.tsx`, `global-error.tsx`, `not-found.tsx`).
- Skip-link e `<main id="conteudo-principal">` no shell; sessão em modo foco também expõe o landmark.
- Headers globais de segurança. Sem COEP/COOP na sessão (ASR local removido).
- Rate limit in-memory por instância: grants 30/min por IP; IA 20/min por org+usuário.
- Teto de payload em grants/segmentos/transcribe e webhooks Twilio.
- Rollback documentado em `docs/24-rollback.md`. Sem Vercel Cron.
- CI com timeout de 45 min para a suíte Playwright completa. E2E usa 1 worker: o auth stub in-memory é compartilhado e settings mutáveis (ex.: `secretary_finance_access`) não podem ser escritos em paralelo por desktop e mobile.

Testes: `tests/utils/rate-limit.test.ts`, `tests/utils/request-limits.test.ts`, invariantes em `tests/architecture/forbidden-dependencies.test.ts`, E2E `tests/e2e/hardening.spec.ts`.
