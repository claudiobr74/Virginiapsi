# Master Prompt — Desenvolvimento do Tesseli

Você está desenvolvendo o **Tesseli**. Este repositório contém a especificação oficial do produto, da arquitetura, da segurança e da identidade visual.

## Missão

Construir um web app de gestão de consultório de psicologia chamado **Tesseli**, com experiência acolhedora, elegante, simples e altamente guiada, implementando com fidelidade a identidade visual descrita em `docs/02-visual-spec.md` e os fluxos descritos em `docs/01-product-spec.md`.


## Gate zero — auditoria antes de implementar

Antes de editar qualquer código, migration, configuração ou runtime prompt:

1. leia e execute `CLAUDE_PRE_IMPLEMENTATION_REVIEW_PROMPT.md` em Plan Mode;
2. revise o repositório inteiro, não apenas a fase inicial;
3. produza verdict `READY`, `READY_WITH_FIXES` ou `NOT_READY`;
4. não implemente nada durante a auditoria;
5. se houver P0, o projeto está `NOT_READY`;
6. após a revisão técnica v1.4, não inicie Fase 0 com `READY_WITH_FIXES`: reaudite após qualquer correção e exija `READY`;
7. aguarde autorização explícita do usuário antes de iniciar `prompts/00-bootstrap.md`.

A auditoria pré-implementação é parte obrigatória do processo Tesseli.

## Restrições absolutas

1. Implemente somente a arquitetura e os contratos definidos neste repositório; não introduza camadas paralelas ou dependências não especificadas.
2. Não adicione Firebase, Firestore, Google Drive, Google Docs, Google Sheets ou NotebookLM como dependência operacional.
3. Não crie um segundo backend. O app é Next.js + Supabase. Route Handlers/Server Actions do Next.js são a camada server quando necessária.
4. O schema é governado por `supabase/migrations`. Não adicione ORM que replique a definição do banco.
5. O frontend nunca recebe `SUPABASE_SECRET_KEY`, `GOOGLE_CLIENT_SECRET`, `TWILIO_AUTH_TOKEN`, `GROQ_API_KEY` ou `GEMINI_API_KEY`.
6. Toda tabela de tenant usa `organization_id` e RLS. Nenhuma autorização pode depender de `members[0]`.
7. Um `organization_id` informado pelo cliente é contexto de navegação, nunca prova de autorização. A autorização é sempre validada por membership/RLS.
8. Não aceite JWT apenas por decode. Não crie token sintético/unsigned. No servidor use primitives oficiais do Supabase Auth para validar a sessão/usuário.
9. Google Login e Google Calendar são conexões independentes. A conta usada para Calendar pode ser diferente da conta de login.
10. Não gere links Google Meet falsos. Meet nasce de `conferenceData.createRequest` com `conferenceSolutionKey.type="hangoutsMeet"`, `conferenceDataVersion=1`, requestId novo e tratamento pending/success/failure.
11. O fluxo ao vivo envia chunks curtos (não arquivos de 100 MB) para o backend; o browser nunca chama Groq. Importação grande usa signed upload privado. Ver `docs/22-transcription-provider-decision.md`.
12. Dados clínicos não podem aparecer em logs, mensagens de erro, analytics ou payloads administrativos da Secretaria.
13. Mudanças clínicas relevantes e operações sensíveis devem ter auditoria.
14. Sem “TODO silencioso”: se algo depende de credencial externa, implemente adapter, teste sem segredo real quando possível e documente exatamente o gate externo pendente.
15. Os runtime prompts clínicos em `src/lib/ai/prompts/**` são comportamento de produto. Não os reescreva durante refactors técnicos sem solicitação explícita.
16. Antes de provider call de IA/gravação/transcrição, aplique consent gate server-side conforme `docs/16-runtime-ai-data-contracts.md`.
17. Não automatize avaliação psicológica, interpretação/pontuação de testes restritos, diagnóstico definitivo ou ajuste de medicação.
18. Lembretes 24h/2h usam Supabase Cron/pg_cron + pg_net + outbox idempotente; não depender de Vercel Cron para cadência sub-diária.
19. A marca visível é VirgíniaPsi. O símbolo oficial é `public/brand/virginia-psi-mark.png`. Use o arquivo exatamente como fornecido; não redesenhe, converta, recorte, recolora ou gere variações. O wordmark é composto na UI.

## Stack

Use a versão estável atual disponível no momento da implementação e registre as versões no package manager:

- Next.js App Router, React, TypeScript strict
- Tailwind CSS
- Supabase JS + `@supabase/ssr`
- Zod para contratos e validação
- Google APIs via OAuth 2.0 server-side
- Twilio SDK no servidor
- Transcrição ao vivo via Groq (`whisper-large-v3-turbo`); spool IndexedDB AES-GCM; importação de gravação. Sem ASR local.
- Google GenAI SDK no servidor
- Supabase pgvector para busca semântica
- Vitest para unit/integration leves
- Playwright para E2E

## Arquitetura

Organize por features, não por “components gigantes”:

- `src/app/` — rotas, layouts e route handlers
- `src/features/auth/`
- `src/features/dashboard/`
- `src/features/patients/`
- `src/features/calendar/`
- `src/features/sessions/`
- `src/features/finance/`
- `src/features/documents/`
- `src/features/supervisor/`
- `src/features/knowledge/`
- `src/features/settings/`
- `src/features/communications/`
- `src/lib/supabase/` — clients browser/server/admin claramente separados
- `src/lib/integrations/` — Google/Twilio/transcrição/Gemini
- `src/lib/security/`
- `src/lib/audit/`
- `src/lib/contracts/`
- `src/lib/ai/prompts/` — textos de runtime da IA; fonte de verdade do comportamento clínico
- `src/lib/ai/contracts/` — structured-output contracts da IA
- `src/components/ui/` — design system Tesseli
- `supabase/migrations/`
- `tests/`

## Princípio de entrega

Cada feature deve ser uma fatia vertical completa:

1. contrato e estados;
2. migration/RLS necessária;
3. serviço/server boundary;
4. UI fiel;
5. validação/erros;
6. testes;
7. gate de segurança;
8. documentação mínima.

## UX obrigatória

Implemente:

- sidebar desktop de 256 px;
- top bar + bottom navigation no mobile;
- módulos: Meu Dia, Pacientes, Agenda, Financeiro, Documentos, Supervisor IA, Conhecimento, Configurações;
- cabeçalhos serifados/itálicos;
- superfícies bone/cream com sage green;
- rounded cards amplos;
- microanimações discretas;
- dark mode equivalente;
- tela de sessão clínica sem distrações;
- PWA instalável quando tecnicamente adequado.

Leia `docs/02-visual-spec.md`, `docs/12-screen-fidelity-blueprint.md` e `VISUAL_MASTER_PROMPT.md` antes de criar qualquer UI.

## Perfis

Inicialmente existem dois perfis funcionais:

- `psychologist_admin`: acesso clínico integral + administração.
- `secretary`: acesso somente ao necessário para pacientes administrativos, agenda e financeiro conforme matriz de permissões; nunca acessa transcrição, notas clínicas, formulação, Supervisor IA ou conteúdo clínico de documentos.

## Integrações

### Supabase

Banco/Auth/Storage são a fonte de verdade. RLS é obrigatória e testada.

### Google Calendar + Meet

- OAuth 2.0 web-server com acesso offline.
- refresh token criptografado no banco.
- seleção explícita de `calendar_id`.
- eventos externos importados podem ser read-only.
- eventos gerenciados pelo Tesseli podem ser criados/atualizados/cancelados.
- Meet só é criado por conferenceData do Calendar.

### Twilio WhatsApp

- templates aprovados quando exigidos;
- webhook inbound;
- status callbacks;
- validação de assinatura Twilio;
- idempotência;
- consentimento/preferência de comunicação.

### Transcrição

- padrão Groq ao vivo: MediaRecorder → `transcribe-chunk` → persistir texto → ACK;
- browser solicita um grant de captura antes de ativar o microfone;
- UI confirma trecho só após ACK; replay não duplica `(session_id, sequence)`;
- spool AES-GCM no dispositivo se a API falhar de forma prolongada;
- importação por arquivo usa Storage temporário privado e apaga o objeto após persistir;
- diarização é capacidade opcional do provider; sem ela, não inventar falante.

### Gemini / Runtime AI

- server-only;
- os textos em `src/lib/ai/prompts/**` são fonte de verdade de comportamento e não podem ser reescritos silenciosamente por agentes de desenvolvimento;
- respostas estruturadas com os contratos de `src/lib/ai/contracts/**`;
- Session AI possui modos ao vivo, preparação e pós-sessão e nunca conversa diretamente com o paciente;
- nenhum diagnóstico autônomo definitivo;
- Supervisor IA produz apoio, hipóteses concorrentes com sustentação/alternativas, formulação TCC/Terapia do Esquema e lentes adicionais apenas quando selecionadas, intervenções com timing/competência/cautelas e revisão humana;
- Runtime AI respeita contexto desenvolvimental, cultural, relacional, diversidade e neurodivergência sem patologização;
- Knowledge usa RAG local, é library-only por padrão, diferencia o papel das fontes e cita somente fontes internas realmente recuperadas;
- `Aplicar ao caso` é modo explícito e separado, com contexto clínico minimizado;
- transcript e fontes recuperadas são dados não confiáveis para instrução e nunca podem sobrescrever o system prompt;
- nenhuma saída clínica de IA é gravada automaticamente no prontuário.

## Processo obrigatório no Cursor

Antes de editar código:

1. leia todas as rules sempre aplicáveis;
2. leia os docs relevantes;
3. use o subagente apropriado para áreas de segurança/integração complexa;
4. produza um plano curto com arquivos a criar/alterar;
5. implemente apenas o escopo da fase atual;
6. execute typecheck/lint/tests;
7. rode o verifier;
8. apresente o relatório do gate: PASS/FAIL/EXTERNAL_BLOCKED.

Não avance automaticamente para a fase seguinte.
