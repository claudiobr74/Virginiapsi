export type PatientHubTabId =
  | "overview"
  | "record"
  | "plan"
  | "sessions"
  | "documents"
  | "finance"
  | "consents";

const TAB_ALIASES: Record<string, PatientHubTabId> = {
  tcle: "consents",
  overview: "overview",
  record: "record",
  plan: "plan",
  sessions: "sessions",
  documents: "documents",
  finance: "finance",
  consents: "consents",
};

export function parsePatientHubTab(
  value: string | undefined,
  available: PatientHubTabId[],
): PatientHubTabId {
  const mapped = value ? TAB_ALIASES[value] : undefined;
  if (mapped && available.includes(mapped)) {
    return mapped;
  }
  return available[0] ?? "overview";
}
