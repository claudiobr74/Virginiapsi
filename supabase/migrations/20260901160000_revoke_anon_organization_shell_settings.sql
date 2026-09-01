-- Tesseli: drop leftover EXECUTE for anon on organization_shell_settings.
-- CREATE OR REPLACE keeps prior ACLs; REVOKE FROM PUBLIC does not remove an
-- explicit anon grant. The function body, owner, search_path and RLS are
-- unchanged. Membership is still enforced by public.is_org_member(org_id).

revoke execute on function public.organization_shell_settings(uuid) from anon;
revoke all on function public.organization_shell_settings(uuid) from public;

grant execute on function public.organization_shell_settings(uuid) to authenticated;
grant execute on function public.organization_shell_settings(uuid) to service_role;
