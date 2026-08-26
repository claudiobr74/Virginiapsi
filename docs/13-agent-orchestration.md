# Orquestração dos Agents no Cursor

Os subagents existem porque o Tesseli cruza domínios com riscos diferentes. **Não invoque todos em cada tarefa.** Use somente o menor conjunto que tenha responsabilidade clara na fase atual.

## Gate pré-implementação

### preimplementation-auditor
Use antes da Fase 0 com `CLAUDE_PRE_IMPLEMENTATION_REVIEW_PROMPT.md`. É read-only, revisa o projeto inteiro, classifica achados e não implementa. Qualquer P0 resulta em `NOT_READY`. Após as correções v1.4 (`docs/20-preimplementation-fixes-v1.4.md`), `READY_WITH_FIXES` também não autoriza Fase 0: corrigir e reauditar até `READY`.

## Núcleo

### architecture-guardian
Use no planejamento de fases, mudanças de arquitetura, novos providers e decisões que possam criar backend/camada duplicada. Preferencialmente review-only antes de mudanças estruturais.

### verifier
Use no final de toda fase aceita como concluída. Deve validar evidência real, rodar testes apropriados e rejeitar “pronto” sem prova.

### debugger
Use apenas quando houver falha reproduzível, teste quebrado ou comportamento divergente. Corrige causa raiz e retorna ao gate da fase.

## Especialistas acionados por contexto

### ui-fidelity
Telas, componentes, responsividade, dark mode, design system, screenshots.

### supabase-security
Migrations, Auth, RLS, Storage policies, tenant isolation, multi-membership e RBAC.

### google-calendar-meet
OAuth Calendar, sync, eventos externos, Meet, timezone e idempotência.

### twilio-communications
WhatsApp outbound/inbound, templates, webhooks, status e consentimento.

### transcription
Transcrição local no dispositivo, grant de captura, persistência incremental e fallback batch opcional.

### clinical-ai
Session AI, Supervisor IA, Gemini, RAG, minimização clínica, structured output, citações e human-in-the-loop.

### runtime-ai-governor
Revisor independente, read-only, para runtime prompts, fronteira de evidência, prompt injection, citações, library-only e no-auto-commit. Use como revisão obrigatória nas fases clínicas de IA.

## Combinações recomendadas por fase

- Pré-Fase 0: preimplementation-auditor → revisão/autorização do usuário.
- Fase 0: architecture-guardian → verifier.
- Fase 1: ui-fidelity → verifier.
- Fase 2: supabase-security → verifier.
- Fase 3: supabase-security + ui-fidelity → verifier.
- Fase 4: google-calendar-meet + supabase-security quando policies mudarem → verifier.
- Fase 5: ui-fidelity → verifier.
- Fase 5.5: supabase-security → verifier. Pré-requisito bloqueante da Fase 6; não pular para transcrição/Session AI sem este gate fechado.
- Fase 6: transcription + clinical-ai + supabase-security → runtime-ai-governor → verifier.
- Fase 7: clinical-ai + supabase-security → runtime-ai-governor → verifier.
- Fase 8: clinical-ai + supabase-security → runtime-ai-governor → verifier.
- Fase 9: supabase-security + ui-fidelity → verifier.
- Fase 10: supabase-security → verifier.
- Fase 11: twilio-communications + supabase-security → verifier.
- Fase 12: architecture-guardian + supabase-security → verifier.
- Fase 13: architecture-guardian + especialistas afetados → verifier.

## Anti-padrão

Não usar subagent apenas para “ter mais opiniões”. Não lançar especialistas paralelos sobre o mesmo arquivo sem necessidade. Skills resolvem workflows repetíveis de escopo menor; subagents são reservados a trabalho com contexto próprio, investigação ou verificação independente.
