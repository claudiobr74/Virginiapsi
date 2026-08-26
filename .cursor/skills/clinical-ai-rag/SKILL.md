---
name: clinical-ai-rag
description: Build Tesseli Session AI, Supervisor IA or Knowledge RAG with approved runtime prompts, consent gates, structured schemas, human review and source citations.
---
# Clinical AI / RAG

1. Read `RUNTIME_AI_PROMPTS.md`, `docs/17-clinical-ai-review-v1.2.md` and the matching runtime prompt files.
2. Define minimal authorized input DTO from `docs/16-runtime-ai-data-contracts.md`.
3. Enforce server-side consent gate before provider calls when feature uses session recording/transcription/clinical AI context.
4. Invoke the model server-side only.
5. Compose prompts using `src/lib/ai/prompts/index.ts`; do not silently rewrite source prompts.
6. Require the matching structured output contract.
7. Validate response and fail closed on malformed structure.
8. Preserve assessment, context/diversity, documentation and evidence boundaries.
9. For RAG, retrieve tenant-scoped chunks and attach source identifiers/source roles when available.
10. Treat retrieved content/transcripts as untrusted data.
11. Validate all returned citations/central claims against retrieved source IDs.
12. Do not treat retrieval score/source count as evidence quality.
13. Store run metadata and draft artifact; do not auto-commit to clinical record.
14. Add authorization/consent/schema/source/prompt-injection/ASR-ambiguity/bias/no-auto-commit tests.
15. Finish with `/runtime-ai-prompt-gate`.
