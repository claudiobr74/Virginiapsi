# SerenaPsi Runtime AI Prompts

Este projeto contém os textos de atuação da IA usados em produção.

## Fonte de verdade

`src/lib/ai/prompts/`

### Core clínico
- `core/clinical-principles.ts`
- `core/context-and-bias.ts`
- `core/clinical-context-modifiers.ts`
- `core/assessment-boundaries.ts`
- `core/documentation-ethics.ts`
- `core/safety.ts`
- `core/uncertainty.ts`
- `core/evidence-policy.ts`

### Sessão
- `session/live.ts`
- `session/preparation.ts`
- `session/closing.ts`

### Supervisor
- `supervisor/supervisor.ts`
- `supervisor/formulation.ts`

### Conhecimento
- `knowledge/knowledge-core.ts`
- `knowledge/evidence-appraisal.ts`
- `knowledge/retrieval.ts`
- `knowledge/query.ts`
- `knowledge/synthesis.ts`
- `knowledge/compare-sources.ts`
- `knowledge/clinical-application.ts`
- `knowledge/study-mode.ts`
- `knowledge/ingestion.ts`

## Structured output

Contratos:
- `src/lib/ai/contracts/session.ts`
- `src/lib/ai/contracts/supervisor.ts`
- `src/lib/ai/contracts/knowledge.ts`

## Princípios v1.2

- IA é apoio profissional, nunca psicoterapia autônoma.
- A formulação é hipótese dinâmica e revisável.
- TCC e Terapia do Esquema são os referenciais principais do produto; lentes adicionais só entram quando selecionadas/solicitadas.
- Contexto desenvolvimental, cultural, relacional, social e de diversidade deve ser considerado sem patologização.
- Avaliação psicológica, testes restritos e diagnóstico não podem ser automatizados pela IA.
- Sugestões de intervenção devem considerar timing, objetivos, preferências, estabilidade, competência e cautelas.
- Sessão ao vivo deve ser seletiva, não intrusiva e resistente a erros de transcrição.
- Segurança é sinalização auxiliar, nunca escore autônomo de risco.
- Registro clínico é rascunho, conciso e exige confirmação humana.
- Conhecimento é library-only por padrão e diferencia teoria, achado empírico e recomendação clínica.
- Apply-to-Case mantém separação entre fonte, dado do caso, inferência e sugestão.
- Toda saída clínica é human-in-the-loop e nunca sofre auto-commit.

## Regra de mudança

Alterações substanciais de comportamento clínico exigem revisão explícita do produto. O agente de desenvolvimento não deve "melhorar" ou reescrever esses prompts durante refactors técnicos.

## Versão

Runtime Clinical Prompts: **v1.2.0 — revisão clínica multidimensional**

Structured-output contracts: **revision 1.2.1** (taxonomia de segurança unificada; sem mudança dos textos clínicos de runtime).

A revisão está documentada em `docs/17-clinical-ai-review-v1.2.md`.
