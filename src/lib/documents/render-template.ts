export type DocumentVariables = Record<string, string>;

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/**
 * Replaces `{{path.to.value}}` placeholders with values from a flat
 * dot-path map built server-side from patient/professional/organization
 * data (never arbitrary/user-supplied HTML — this is plain text
 * substitution, not a template engine that could execute anything). A
 * placeholder with no matching variable is left as-is rather than
 * silently blanked: a missing patient name disappearing from an atestado
 * unnoticed is worse than an ugly `{{patient.full_name}}` left visible.
 */
export function renderTemplate(bodyTemplate: string, variables: DocumentVariables): string {
  return bodyTemplate.replace(PLACEHOLDER_PATTERN, (match, key: string) =>
    key in variables ? variables[key] : match,
  );
}

/** Every `{{...}}` placeholder present in a template, for a "preview what will be filled" UI. */
export function extractPlaceholders(bodyTemplate: string): string[] {
  const matches = bodyTemplate.matchAll(PLACEHOLDER_PATTERN);
  return [...new Set([...matches].map((match) => match[1]))];
}

/** True when any `{{token}}` remains after substitution — emission must stop. */
export function hasUnresolvedPlaceholders(text: string): boolean {
  PLACEHOLDER_PATTERN.lastIndex = 0;
  return PLACEHOLDER_PATTERN.test(text);
}

export function unresolvedPlaceholders(text: string): string[] {
  return extractPlaceholders(text);
}

/** Adds document-scoped keys only when the professional actually provided them. */
export function withDocumentScopedVariables(
  base: DocumentVariables,
  extra: { purpose?: string | null; recipientName?: string | null },
): DocumentVariables {
  const next = { ...base };
  if (extra.purpose?.trim()) {
    next["document.purpose"] = extra.purpose.trim();
  }
  if (extra.recipientName?.trim()) {
    next["recipient.name"] = extra.recipientName.trim();
  }
  return next;
}
