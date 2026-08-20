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
