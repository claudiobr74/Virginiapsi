# SerenaPsi — Project

Este repositório define a especificação funcional, visual e técnica do **SerenaPsi**, um web app para gestão de consultório de psicologia, desenvolvido no Cursor.

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
- Deepgram para transcrição em tempo real
- Gemini para Supervisor Clínico IA e apoio ao módulo de Conhecimento
- Supabase pgvector para base de conhecimento/RAG local
- Playwright + Vitest + TypeScript + ESLint

## Decisões arquiteturais

Não fazem parte da arquitetura do SerenaPsi:

- Firebase / Firestore / Firebase Storage / Firebase Auth
- Google Drive, Google Docs ou Google Sheets como backend do produto
- NotebookLM como dependência operacional
- Express paralelo ao Next.js
- NestJS paralelo ao Next.js
- Drizzle/ORM duplicando o schema do Supabase
- JWT sintético em testes
- fallback que envia áudio em base64 pelo backend/Vercel

## Ordem de uso

1. Crie um repositório GitHub vazio para o SerenaPsi.
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

## Primeiro objetivo

A primeira entrega é **a auditoria pré-implementação**, não código. Após as correções v1.4, a reauditoria deve retornar `READY`. Só após `READY` e autorização explícita do usuário começa a fundação técnica, visual e de segurança. O SerenaPsi cresce por fatias verticais completas: UI + domínio + banco + RLS + testes + auditoria quando aplicável.

## Asset oficial da marca

A logo oficial está em `public/brand/Logo SerenaPsi em Gradiente Sereno(2).png` e deve ser utilizada diretamente, sem qualquer edição ou interpretação. O arquivo faz parte da especificação do produto e é imutável.

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
sudo -u postgres psql -c "create role serenapsi_admin login password 'serenapsi' superuser createdb"
sudo -u postgres createdb -O serenapsi_admin serenapsi_test
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
- tokens SerenaPsi (paleta sage/bone, Inter, Playfair Display, JetBrains Mono) e dark mode automático via `prefers-color-scheme`;
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

UI: lista com busca e filtros por situação, cadastro/edição em 4 seções (Identificação; Contato & Responsáveis; Atendimento & Situação; Financeiro & Termos), Patient Hub com "Dados do Paciente" e "Acompanhamento" (admin) mais estados vazios para as seções que chegam em fases futuras (Adesão & Planos — Fase 10, Pendências — Fase 5, Prontuário — Fase 6, Documentos e TCLE — Fase 9, Extrato Financeiro — Fase 10).

Durante a fase corrigimos também um bug de regressão no primitivo `Button`: `asChild` quebrava com o Radix `Slot` sempre que `isLoading` era `false`, porque o spinner condicional virava um segundo nó filho mesmo renderizando `null`. Guardado por teste de unidade (`tests/components/button.test.tsx`).

## Fase 4 — Agenda + Google Calendar + Meet

Migration `supabase/migrations/*_google_calendar.sql`: `google_calendar_connections` (metadados não sensíveis — status, e-mail, calendário selecionado, último sync), `google_calendar_credentials` (tokens criptografados), `appointments` e `calendar_sync_events` (auditoria de sync, sem conteúdo clínico).

- `google_calendar_credentials` tem RLS habilitada e **nenhuma policy** — nenhum papel, nem a psicóloga administradora que conectou a conta, tem `GRANT` na tabela via Data API. O único acesso é por `SECURITY DEFINER`: `upsert_google_credentials()`/`disconnect_google_calendar()` exigem `is_psychologist_admin`, `get_google_credentials()` exige apenas `is_org_member` (o valor retornado continua criptografado — só o Node do servidor, com `GOOGLE_TOKEN_ENCRYPTION_KEY`, consegue decifrar).
- Conectar/desconectar o Google é ação de admin; **selecionar** qual calendário já conectado usar fica aberto aos dois papéis (linha "calendar sync: CRUD para os dois papéis" da matriz de RBAC), porque isso é operação do dia a dia da Agenda, não gestão da integração em si.
- `appointments.origin` distingue `SERENAPSI` (gerenciado, bidirecional) de `GOOGLE_EXTERNAL` (importado, somente leitura). As policies de INSERT/UPDATE/DELETE só autorizam linhas `SERENAPSI` — um evento externo nunca é editável por escrita direta de nenhum papel. O pull-sync usa `upsert_external_appointment()` (`SECURITY DEFINER`, upsert por `organization_id + google_calendar_id + google_event_id`), que já nasce com `origin = 'GOOGLE_EXTERNAL'` e ignora silenciosamente qualquer tentativa de sobrescrever uma linha `SERENAPSI` com o mesmo id externo.
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
- Linha do tempo de hoje (somente `origin = SERENAPSI`; eventos Google externos continuam na Agenda).
- Tarefas operacionais em `practice_tasks` (CRUD dos dois papéis, `created_by_user_id` forçado para `auth.uid()`).
- **Sessões a finalizar**, **pendências financeiras** e **documentos recentes** são estados vazios explícitos de fase futura (6, 10 e 9) — sem mock de domínio.

O envio Twilio/outbox de lembretes permanece na Fase 11: o botão de WhatsApp desta fase é só o entry point administrativo (deep-link), nunca dispara o provider.

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

O gate de capability (`src/lib/consent/capability-gate.ts`) é o ponto único por onde passam as duas capabilities de captura — token temporário Deepgram e signed upload grant do fallback —, ambas exigindo o mesmo consentimento de gravação **e** transcrição. As rotas `/api/integrations/deepgram/token` e `/api/integrations/deepgram/upload-grant` já negam (403) sem tocar em provider nenhum; a emissão em si é da Fase 6 e o caminho liberado responde 501 em vez de devolver credencial fabricada. Um teste de arquitetura falha se uma rota nova sob `deepgram/` esquecer o gate.

Recusa não vira "resistência": o `ConsentState` exposto é só booleano/versão/data — não existe campo narrativo de motivo que pudesse viajar para a formulação clínica (`docs/17-clinical-ai-review-v1.2.md` §3.14), e há teste de contrato sobre a forma do DTO.

Testes: 8 de RLS (`tests/security/consents.test.ts`), 20 de resolução/gate (`tests/utils/consent-state.test.ts`) e 5 E2E (`tests/e2e/consents.spec.ts`) que provam negação sem consentimento, liberação após registro, novo bloqueio após revogação e negação por papel.
