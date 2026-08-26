# Fase 7 — Supervisor Clínico IA

Use `clinical-ai`, `runtime-ai-governor`, `/clinical-ai-rag` e `/runtime-ai-prompt-gate`.

Antes de implementar, leia:
- `RUNTIME_AI_PROMPTS.md`
- `docs/14-runtime-ai-architecture.md`
- `docs/15-runtime-ai-test-matrix.md`
- `docs/16-runtime-ai-data-contracts.md`
- `docs/17-clinical-ai-review-v1.2.md`
- `src/lib/ai/prompts/core/*`
- `src/lib/ai/prompts/supervisor/*`
- `src/lib/ai/contracts/supervisor.ts`

Implemente UI e backend para:
- paciente + sessões selecionadas;
- objetivo da supervisão;
- pergunta clínica;
- abordagem principal TCC/Esquema/integrativa;
- lentes adicionais apenas quando selecionadas/solicitadas;
- descriptor de contexto opcional: faixa etária, modalidade individual/casal/família/grupo, objetivos, preferências e fatores relevantes;
- flag explícita quando a psicóloga solicitar raciocínio diagnóstico;
- preview dos dados enviados;
- Gemini/model provider server-side;
- schema estruturado;
- resposta direta à pergunta;
- síntese clínica;
- objetivos/preferências/recursos/contexto;
- dados relevantes classificados;
- hipóteses concorrentes com evidência favorável/contrária, alternativas e sustentação;
- formulação TCC;
- formulação em Terapia do Esquema;
- lentes adicionais somente se habilitadas;
- processo terapêutico;
- pontos cegos como possibilidades verificáveis;
- intervenções priorizadas com objetivo, racional, pré-requisitos, timing, competência, cautelas e sinais de reavaliação;
- perguntas sugeridas abertas/não indutivas;
- plano flexível de próxima sessão;
- competência/supervisão humana/interconsulta/encaminhamento quando pertinente;
- risco/ética/limitações;
- fontes somente quando RAG realmente fornecer fontes;
- histórico de runs com prompt/schema version;
- botão explícito para anexar conteúdo selecionado ao prontuário.

Nunca auto-commit AI.
Nunca inventar bibliografia.
Nunca automatizar avaliação psicológica/testes restritos.
Nunca recomendar ajuste de medicação.
Nunca reescrever silenciosamente os runtime prompts.

Gate:
- authorization;
- malformed output;
- human review;
- no clinical logs;
- prompt injection;
- hypothesis/evidence/alternative separation;
- no fabricated citations;
- framework-selection boundary;
- developmental/couple-family/context bias tests;
- trauma/suggestibility tests;
- no restricted-test interpretation;
- no medication adjustment;
- competence/human-supervision behavior;
- `/runtime-ai-prompt-gate`;
- verifier.

Pare.
