-- WhatsApp created consents_*_administrative alongside consents_*_admin.
-- G2 replaces the admin policies with D4b clinical policies; the leftover
-- administrative pair is redundant (administrative types remain allowed via
-- is_org_member in the G2 policies). Drop so a later audit does not treat
-- them as a second INSERT/UPDATE path.

drop policy if exists consents_insert_administrative on public.consents;
drop policy if exists consents_update_administrative on public.consents;
