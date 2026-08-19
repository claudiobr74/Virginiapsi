---
name: runtime-ai-prompt-gate
description: Validate SerenaPsi Session AI, Supervisor AI or Knowledge AI runtime behavior before accepting an AI feature.
---
# Runtime AI Prompt Gate

1. Read `RUNTIME_AI_PROMPTS.md` and `docs/17-clinical-ai-review-v1.2.md`.
2. Identify the runtime prompt(s) and structured-output contract used by the feature.
3. Confirm server-only model invocation.
4. Confirm applicable consent gates happen before provider calls.
5. Confirm prompt composition uses the approved registry and current version.
6. Confirm malformed output fails closed.
7. Confirm transcript/source prompt injection cannot override instructions.
8. Confirm evidence categories remain separated.
9. Confirm psychological assessment/test interpretation/definitive diagnosis/medication adjustment boundaries remain intact.
10. For Session, verify ASR ambiguity, non-suggestive questioning, no emotion-recognition and no auto-persistence of live hypotheses.
11. For Supervisor, verify competing hypotheses/alternatives, context, framework selection, competence/human-supervision flags and no auto-commit.
12. For Knowledge, verify citations belong to retrieved source IDs, source roles are not equated automatically, efficacy claims require compatible evidence and library-only mode does not use model memory.
13. For Apply-to-Case, verify explicit opt-in, minimized context and source/case/inference/suggestion separation.
14. Confirm no AI output is auto-committed to clinical record.
15. Execute relevant items from `docs/15-runtime-ai-test-matrix.md`.
16. Return PASS/FAIL and block the phase on FAIL.
