-- VirgíniaPsi — Financeiro v2 / Fase 1 hardening.
-- Hosted validation showed explicit legacy anon EXECUTE grants persisted on
-- finance RPCs despite PUBLIC being revoked. Remove anon access explicitly.

revoke execute on function public.create_session_charge(uuid, uuid) from anon;
revoke execute on function public.create_financial_plan_with_initial_charge(
  uuid, uuid, public.financial_plan_type, integer, numeric, date, date, text
) from anon;
