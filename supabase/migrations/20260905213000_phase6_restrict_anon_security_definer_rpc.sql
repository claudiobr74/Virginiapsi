-- Phase 6A: remove unauthenticated RPC execution from SECURITY DEFINER helpers.
-- Keep authenticated and service_role execution unchanged to preserve existing
-- RLS helper semantics and signed-in application flows.

revoke execute on function public.can_access_clinical_session(uuid, uuid) from anon;
revoke execute on function public.can_access_document(uuid, uuid, public.document_sensitivity) from anon;
revoke execute on function public.can_access_patient_clinical(uuid, uuid) from anon;
revoke execute on function public.can_access_patient_record(uuid, uuid) from anon;
revoke execute on function public.can_manage_org_patients(uuid) from anon;
revoke execute on function public.can_read_finance(uuid) from anon;
revoke execute on function public.can_write_finance(uuid) from anon;
revoke execute on function public.finance_period_is_closed(uuid, date) from anon;
revoke execute on function public.has_org_role(uuid, text[]) from anon;
revoke execute on function public.is_clinical_practitioner(uuid) from anon;
revoke execute on function public.is_org_member(uuid) from anon;
revoke execute on function public.is_platform_operator() from anon;
revoke execute on function public.is_psychologist_admin(uuid) from anon;
revoke execute on function public.list_assignable_psychologists(uuid) from anon;
revoke execute on function public.list_organization_members(uuid) from anon;
revoke execute on function public.patient_whatsapp_allowed(uuid, uuid) from anon;
revoke execute on function public.platform_bootstrap_state() from anon;
revoke execute on function public.secretary_finance_access(uuid) from anon;
