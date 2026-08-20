-- Tesseli — Phase 7: Supervisor Clínico IA.
--
-- No new tables: "histórico de supervisões" (docs/01 §8) is the existing
-- ai_runs/ai_artifacts pair from Phase 6, which already carries
-- patient_id/prompt_version/schema_version/model per execution — a
-- dedicated `supervisor_sessions` table would just duplicate that. The
-- run's `source_ids` jsonb records which clinical sessions were selected
-- as input for a given supervision.
--
-- The only schema change is widening the purpose/type vocabulary that
-- Phase 6 deliberately left extensible (see that migration's header
-- comment) to admit 'supervisor'.

alter table public.ai_runs drop constraint ai_runs_purpose_check;
alter table public.ai_runs add constraint ai_runs_purpose_check
  check (purpose in ('session_live', 'session_preparation', 'session_closing', 'supervisor'));

alter table public.ai_artifacts drop constraint ai_artifacts_type_check;
alter table public.ai_artifacts add constraint ai_artifacts_type_check
  check (type in ('session_live', 'session_preparation', 'session_closing', 'supervisor'));
