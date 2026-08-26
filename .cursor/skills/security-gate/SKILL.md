---
name: security-gate
description: Run Tesseli adversarial auth, tenant, role, storage and secret-leak checks before accepting a sensitive phase.
disable-model-invocation: true
---
# Security Gate

Run:
1. unauthenticated rejection;
2. forged token rejection through real auth path;
3. wrong-tenant select/write rejection;
4. multi-membership active-org correctness;
5. secretary clinical payload denial;
6. Storage cross-tenant denial;
7. service-role/client secret scan;
8. logs scan for clinical data patterns;
9. integration-specific signature/state tests if applicable.

Do not substitute mocks for the enforcement under test.
