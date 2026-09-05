-- VirgíniaPsi — close AI artifact append RPC and enum to authenticated callers.
revoke execute on function public.append_verified_ai_artifact_to_session(
  uuid, uuid, integer, public.ai_artifact_append_mode, boolean, boolean
) from PUBLIC, anon;

grant execute on function public.append_verified_ai_artifact_to_session(
  uuid, uuid, integer, public.ai_artifact_append_mode, boolean, boolean
) to authenticated, service_role;

revoke usage on type public.ai_artifact_append_mode from PUBLIC, anon;
grant usage on type public.ai_artifact_append_mode to authenticated, service_role;
