-- VirgíniaPsi — Fase 3: reduce anonymous SECURITY DEFINER RPC surface.
--
-- This migration is intentionally selective:
-- - authenticated application RPCs keep authenticated/service_role execution;
-- - internal jobs become service_role/internal only;
-- - RLS helper functions (can_access_*, is_org_member, etc.) are NOT changed here;
-- - the hosted-only rls_auto_enable() event-trigger helper is hardened only when present.

-- Authenticated application RPCs: never callable before login.
revoke execute on function public.accept_pending_invitations() from public, anon;
grant execute on function public.accept_pending_invitations() to authenticated, service_role;

revoke execute on function public.add_platform_operator(uuid) from public, anon;
grant execute on function public.add_platform_operator(uuid) to authenticated, service_role;

revoke execute on function public.bootstrap_organization(text, text, text, text) from public, anon;
grant execute on function public.bootstrap_organization(text, text, text, text) to authenticated, service_role;

revoke execute on function public.claim_platform_operator() from public, anon;
grant execute on function public.claim_platform_operator() to authenticated, service_role;

revoke execute on function public.disconnect_google_calendar(uuid) from public, anon;
grant execute on function public.disconnect_google_calendar(uuid) to authenticated, service_role;

revoke execute on function public.enqueue_appointment_whatsapp_reminders(uuid) from public, anon;
grant execute on function public.enqueue_appointment_whatsapp_reminders(uuid) to authenticated, service_role;

revoke execute on function public.ensure_whatsapp_templates(uuid) from public, anon;
grant execute on function public.ensure_whatsapp_templates(uuid) to authenticated, service_role;

revoke execute on function public.get_google_credentials(uuid) from public, anon;
grant execute on function public.get_google_credentials(uuid) to authenticated, service_role;

revoke execute on function public.invite_organization_member(uuid, text, public.organization_role) from public, anon;
grant execute on function public.invite_organization_member(uuid, text, public.organization_role) to authenticated, service_role;

revoke execute on function public.log_audit_event(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.log_audit_event(uuid, text, text, text, jsonb) to authenticated, service_role;

revoke execute on function public.log_calendar_sync_event(uuid, public.calendar_sync_direction, text, uuid, jsonb, text, text) from public, anon;
grant execute on function public.log_calendar_sync_event(uuid, public.calendar_sync_direction, text, uuid, jsonb, text, text) to authenticated, service_role;

revoke execute on function public.log_patient_audit_event(uuid, text, jsonb) from public, anon;
grant execute on function public.log_patient_audit_event(uuid, text, jsonb) to authenticated, service_role;

-- Internal scheduled jobs: no API client execution.
revoke execute on function public.expire_stale_logical_exports() from public, anon, authenticated;
grant execute on function public.expire_stale_logical_exports() to service_role;

revoke execute on function public.purge_expired_fallback_audio() from public, anon, authenticated;
grant execute on function public.purge_expired_fallback_audio() to service_role;

-- Hosted project currently has public.rls_auto_enable() backing the active
-- ensure_rls ddl_command_end event trigger. Clean migration reconstruction does
-- not create that infrastructure object, so harden it only in environments where
-- it actually exists instead of manufacturing schema drift inside this ACL patch.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;
