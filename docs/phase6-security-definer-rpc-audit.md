# Phase 6A — SECURITY DEFINER RPC audit

## Scope

This phase removes unauthenticated (`anon`) execution from 18 `SECURITY DEFINER` functions that are currently exposed through the Data API. It intentionally preserves `authenticated` and `service_role` execution so existing RLS helper semantics and signed-in application flows remain unchanged.

## Targeted functions

- can_access_clinical_session(uuid, uuid)
- can_access_document(uuid, uuid, document_sensitivity)
- can_access_patient_clinical(uuid, uuid)
- can_access_patient_record(uuid, uuid)
- can_manage_org_patients(uuid)
- can_read_finance(uuid)
- can_write_finance(uuid)
- finance_period_is_closed(uuid, date)
- has_org_role(uuid, text[])
- is_clinical_practitioner(uuid)
- is_org_member(uuid)
- is_platform_operator()
- is_psychologist_admin(uuid)
- list_assignable_psychologists(uuid)
- list_organization_members(uuid)
- patient_whatsapp_allowed(uuid, uuid)
- platform_bootstrap_state()
- secretary_finance_access(uuid)

## Explicit non-goals

- Do not change any function body.
- Do not change `SECURITY DEFINER` to `SECURITY INVOKER` in this phase.
- Do not revoke `authenticated` or `service_role` execution.
- Do not move functions between schemas yet.
- Do not change `vector`, Auth leaked-password protection, RLS policies, or unrelated indexes.

## Validation gate

1. Foundation CI green.
2. Hosted migration applied only after CI.
3. Security Advisor rerun.
4. Confirm Advisor 0028 findings disappear for all 18 targeted functions.
5. Verify authenticated calls and RLS-backed flows remain operational.
6. Keep Advisor 0029 work for a separate Phase 6B classification pass.
