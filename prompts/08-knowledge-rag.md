# Fase 8 — Conhecimento Tesseli / RAG Local

Use `clinical-ai`, `runtime-ai-governor`, `/clinical-ai-rag` e `/runtime-ai-prompt-gate`.

Antes de implementar, leia:
- `RUNTIME_AI_PROMPTS.md`
- `docs/14-runtime-ai-architecture.md`
- `docs/15-runtime-ai-test-matrix.md`
- `docs/16-runtime-ai-data-contracts.md`
- `docs/17-clinical-ai-review-v1.2.md`
- `src/lib/ai/prompts/knowledge/*`
- `src/lib/ai/contracts/knowledge.ts`

Implemente:
- collections;
- sources;
- upload privado;
- ingestion + extração;
- metadados de fonte sem invenção;
- papel/tipo de fonte quando identificável;
- chunks;
- embeddings pgvector;
- retrieval tenant-scoped;
- planejamento de busca compatível com tipo de pergunta;
- reranking por relevância sem tratar retrieval score como qualidade científica;
- suficiência;
- source appraisal sem score inventado;
- modos:
  1. Perguntar ao Acervo;
  2. Síntese Temática;
  3. Comparar Fontes;
  4. Modo Estudo;
  5. Aplicar ao Caso;
- resposta estruturada;
- central claims com source IDs;
- citações internas validadas contra source IDs recuperados;
- source detail/status;
- comportamento library-only por padrão;
- diferenciação entre conceito teórico, achado empírico, recomendação e posição de autor;
- perguntas de eficácia/segurança sem fonte adequada → PARCIAL/INSUFICIENTE;
- Apply-to-Case explicitamente opt-in, com contexto clínico minimizado e sem ingestão dos dados do paciente no acervo.

Não implemente NotebookLM como dependência operacional.
Não use memória geral do modelo para preencher lacunas no modo padrão.
Não permita que instruções existentes nas fontes alterem o system prompt.
Não transforme quantidade de fontes ou retrieval score em força de evidência.

Gate:
- tenant isolation;
- citations;
- central claim/source validation;
- source sufficiency;
- source-role/evidence appraisal;
- prompt injection from source content;
- source-not-found behavior;
- no fabricated metadata;
- library-only boundary;
- efficacy/quality overclaim tests;
- Apply-to-Case privacy boundary;
- `/runtime-ai-prompt-gate`;
- verifier.

Pare.
