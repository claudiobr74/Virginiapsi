/**
 * Schema adapter (docs/06-integrations.md §"Superfície da API e dialeto de
 * schema"): converts a canonical JSON Schema contract from
 * `src/lib/ai/contracts/**` into the dialect the chosen Gemini API surface
 * accepts, without ever editing the source contract.
 *
 * API surface pinned for Phase 6 (Session AI): `responseJsonSchema`
 * (REST field `generationConfig.response_json_schema` / `response_mime_type:
 * "application/json"`), NOT the older `responseSchema` (OpenAPI 3.0 subset).
 * Verified against ai.google.dev/gemini-api/docs/structured-output and the
 * Google AI blog's "Structured Outputs" announcement on 2026-08-20:
 * `responseJsonSchema` natively supports `additionalProperties` and
 * `type: ["x", "null"]` (JSON Schema, not the OpenAPI nullable/no-
 * additionalProperties subset) since the November 2025 structured-outputs
 * update — the exact dialect the contracts in `src/lib/ai/contracts/**`
 * already use. That makes this adapter a structural pass-through rather
 * than a keyword rewrite: there is no OpenAPI-subset conversion to do for
 * this surface.
 *
 * `SESSION_LIVE_SCHEMA`/`SESSION_PREPARATION_SCHEMA`/`SESSION_CLOSING_SCHEMA`
 * are not deeply nested enough to need the composition spike docs/06 §4
 * reserves for `SUPERVISOR_SCHEMA` (Phase 7).
 */
export function toGeminiResponseJsonSchema<T>(contract: T): T {
  // Deep-clones (and thereby drops any `as const` literal-type-only
  // artifacts, which do not exist at runtime anyway) so callers can never
  // accidentally mutate the shared contract object.
  return JSON.parse(JSON.stringify(contract)) as T;
}
