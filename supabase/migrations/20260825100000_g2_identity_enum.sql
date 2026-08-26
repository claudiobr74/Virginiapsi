-- G2 identity: add clinical psychologist role.
-- Must live in its own migration so ADD VALUE commits before any later
-- statement uses the new enum label (safe on Postgres < 15 as well as 17).

alter type public.organization_role add value if not exists 'psychologist';
