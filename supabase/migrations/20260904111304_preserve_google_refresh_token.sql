-- Google normally omits refresh_token when it renews an access token.
-- Update the existing credential row directly in that case so the NOT NULL
-- constraint is never evaluated against a transient NULL insert value.
create or replace function public.upsert_google_credentials(
  org_id uuid,
  p_access_token_encrypted text,
  p_access_token_expires_at timestamptz,
  p_refresh_token_encrypted text,
  p_google_account_email text default null,
  p_scopes text[] default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_psychologist_admin(org_id) then
    raise exception 'only psychologist_admin may connect Google Calendar'
      using errcode = '42501';
  end if;

  if p_refresh_token_encrypted is null then
    update public.google_calendar_credentials
    set access_token_encrypted = p_access_token_encrypted,
        access_token_expires_at = p_access_token_expires_at,
        updated_at = now()
    where organization_id = org_id;

    if not found then
      raise exception 'refresh token is required for initial Google connection'
        using errcode = '23502';
    end if;
  else
    insert into public.google_calendar_credentials (
      organization_id,
      access_token_encrypted,
      access_token_expires_at,
      refresh_token_encrypted
    )
    values (
      org_id,
      p_access_token_encrypted,
      p_access_token_expires_at,
      p_refresh_token_encrypted
    )
    on conflict (organization_id) do update set
      access_token_encrypted = excluded.access_token_encrypted,
      access_token_expires_at = excluded.access_token_expires_at,
      refresh_token_encrypted = excluded.refresh_token_encrypted,
      updated_at = now();
  end if;

  insert into public.google_calendar_connections (
    organization_id,
    status,
    google_account_email,
    scopes,
    connected_by_user_id
  )
  values (
    org_id,
    'connected',
    p_google_account_email,
    coalesce(p_scopes, array[]::text[]),
    auth.uid()
  )
  on conflict (organization_id) do update set
    status = 'connected',
    google_account_email = coalesce(
      excluded.google_account_email,
      public.google_calendar_connections.google_account_email
    ),
    scopes = case
      when p_scopes is not null then excluded.scopes
      else public.google_calendar_connections.scopes
    end,
    last_sync_error = null;
end;
$$;

revoke all on function public.upsert_google_credentials(
  uuid,
  text,
  timestamptz,
  text,
  text,
  text[]
) from public, anon;

grant execute on function public.upsert_google_credentials(
  uuid,
  text,
  timestamptz,
  text,
  text,
  text[]
) to authenticated;
