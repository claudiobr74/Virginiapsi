---
name: supabase-migration-rls
description: Create or review Supabase migrations with tenant-safe RLS and adversarial tests.
---
# Supabase Migration + RLS

1. State tables/columns/indexes/constraints.
2. State allowed actors for select/insert/update/delete.
3. Create migration.
4. Enable RLS.
5. Add policies using membership/role helpers.
6. Add Storage policies if files are involved.
7. Regenerate types.
8. Test owner/admin, secretary, wrong tenant, unauthenticated, multi-membership.
9. Never use service-role to make a failing RLS test pass.

10. For SECURITY DEFINER membership helpers, verify STABLE + empty search_path + schema-qualified references + minimal EXECUTE grants.
11. Verify finance permission overrides are represented in data and enforced by RLS, not UI only.
12. Add concurrency/uniqueness tests for counters and idempotent segment keys when relevant.
