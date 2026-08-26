---
name: feature-slice
description: Implement one Tesseli feature as a complete vertical slice with schema/RLS, server boundary, UI, tests and gate.
---
# Vertical Feature Slice

For the named feature:

1. Read product + visual spec section.
2. Define actors, permissions and DTOs.
3. Design migrations/RLS if data changes.
4. Implement server/domain layer.
5. Implement UI using Serena primitives.
6. Add validation/idempotency/audit where relevant.
7. Add unit/integration/E2E tests.
8. Run verifier.
9. Stop with PASS/FAIL/EXTERNAL_BLOCKED.

Do not broaden scope into adjacent phases.
