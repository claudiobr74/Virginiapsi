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

## Execução local — Fase 0

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
pnpm test         # Vitest: env, arquitetura, contratos
pnpm build
pnpm test:e2e     # Playwright smoke da fundação
```

Supabase CLI está instalado como devDependency. Ainda não há migrations de produto (Fase 2). Para preparar o ambiente local depois da Fase 2:

```bash
pnpm exec supabase --version
pnpm exec supabase start
```

O gate da Fase 0 é: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` mais o scan de arquitetura (já incluído em `pnpm test`). Não avance para a Fase 1 sem esse gate em PASS.
