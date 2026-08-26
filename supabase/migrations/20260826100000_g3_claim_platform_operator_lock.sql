-- G3a: serialize claim_platform_operator on an empty allowlist.
-- Two concurrent first logins must not both become operators (D5b).
-- Spec: docs/26-go-live.md §6.

create or replace function public.claim_platform_operator()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'platform operator claim requires an authenticated user'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('tesseli.platform_operators.claim'));

  if exists (select 1 from public.platform_operators) then
    return public.is_platform_operator();
  end if;

  insert into public.platform_operators (user_id, created_by)
  values (actor, actor);

  return true;
end;
$$;

revoke all on function public.claim_platform_operator() from public;
grant execute on function public.claim_platform_operator() to authenticated;

comment on function public.claim_platform_operator() is
  'First authenticated caller becomes the operator when the allowlist is empty. Advisory lock serializes concurrent claims.';
