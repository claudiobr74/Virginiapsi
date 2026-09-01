/**
 * Visual-only tokens extracted from a Google/VirginiaPsi summary.
 * Never used to auto-link a patient.
 */
export function extractAppointmentTitleHints(
  summary: string | null | undefined,
): string[] {
  if (!summary) {
    return [];
  }

  const parts = summary.split(/[/|,?]+/);
  const hints: string[] = [];
  for (const part of parts) {
    let cleaned = part
      .replace(/\(\s*c\s*\)/gi, " ")
      .replace(/\(\s*desmarcou\s*\)/gi, " ")
      .replace(/\(\s*plantão\s*\)/gi, " ")
      .replace(/\(\s*viajando\s*\)/gi, " ")
      .replace(/\+\d+/g, " ")
      .replace(/-\d+\s*$/g, " ")
      .replace(/[?]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length >= 2) {
      hints.push(cleaned);
    }
  }
  return [...new Set(hints)];
}
