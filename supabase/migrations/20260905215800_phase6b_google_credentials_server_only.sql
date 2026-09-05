-- Phase 6B, batch 1: keep encrypted Google credential reads server-only.
-- The application reads this RPC only through the server-only Google integration
-- module. Service-role access is intentional; signed-in browser/Data API access
-- is not required and unnecessarily exposes encrypted OAuth token material.

create or replace function public.get_google_credentials(org_id uuid)
returns table (
  access_token_encrypted text,
  access_token_expires_at timestamptz,
  refresh_token_encrypted text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.access_token_encrypted,
    c.access_token_expires_at,
    c.refresh_token_encrypted
  from public.google_calendar_credentials c
  where c.organization_id = org_id
    and (select auth.role()) = 'service_role';
$$;

revoke execute on function public.get_google_credentials(uuid) from public;
revoke execute on function public.get_google_credentials(uuid) from anon;
revoke execute on function public.get_google_credentials(uuid) from authenticated;
grant execute on function public.get_google_credentials(uuid) to service_role;
