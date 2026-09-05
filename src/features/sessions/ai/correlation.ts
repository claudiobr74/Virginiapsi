/** Operator-facing correlation helpers. Safe to import from client components. */

export function newSessionAiCorrelationId(): string {
  return crypto.randomUUID();
}

/** First 8 hex chars of the UUID, without hyphens. */
export function shortCorrelationCode(correlationId: string): string {
  return correlationId.replaceAll("-", "").slice(0, 8).toUpperCase();
}
