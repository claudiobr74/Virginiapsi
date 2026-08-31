-- READ-ONLY tenant duplication audit.
-- Run in the Supabase SQL editor. Does not update, delete, or copy tokens.
-- Never merge organizations from this script.

select
  o.id as organization_id,
  o.name,
  o.timezone,
  o.created_at as organization_created_at,
  (
    select count(*)
    from public.organization_members m
    where m.organization_id = o.id
      and m.active
  ) as members,
  (
    select count(*)
    from public.patients p
    where p.organization_id = o.id
  ) as patients,
  (
    select count(*)
    from public.appointments a
    where a.organization_id = o.id
  ) as appointments,
  (
    select count(*)
    from public.clinical_sessions s
    where s.organization_id = o.id
  ) as sessions,
  (
    select count(*)
    from public.documents d
    where d.organization_id = o.id
  ) as documents,
  (
    select count(*)
    from public.financial_charges f
    where f.organization_id = o.id
  ) as financial_records,
  c.status as google_connection,
  c.google_account_email,
  c.calendar_id,
  c.last_synced_at,
  (
    select count(*)
    from public.appointments a
    where a.organization_id = o.id
      and a.origin = 'GOOGLE_EXTERNAL'
  ) as google_events
from public.organizations o
left join public.google_calendar_connections c
  on c.organization_id = o.id
order by o.name, o.created_at;

-- Duplicate display names (candidate pairs only — no automatic canonical pick).
select
  name,
  count(*) as organization_count,
  array_agg(id order by created_at) as organization_ids
from public.organizations
group by name
having count(*) > 1
order by name;
