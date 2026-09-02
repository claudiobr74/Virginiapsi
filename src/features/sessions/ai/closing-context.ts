import type { SessionWorkingNotesRow, TranscriptSegmentRow } from "@/features/sessions/contracts";
import type { PatientRef } from "@/features/sessions/ai/dto";

/** Non-identifying label — do not put the patient's name in the model prompt. */
export function closingPatientRef(): PatientRef {
  return { displayLabel: "Paciente da sessão" };
}

export function selectPersistedTranscriptText(
  segments: Pick<TranscriptSegmentRow, "text" | "is_final">[],
): string {
  return segments
    .filter((segment) => segment.is_final)
    .map((segment) => segment.text.trim())
    .filter((text) => text.length > 0)
    .join(" ")
    .trim();
}

export function formatWorkingNotesForClosing(
  notes: Pick<
    SessionWorkingNotesRow,
    "formulation" | "hypotheses" | "working_observations"
  > | null,
  extraClinicianNotes?: string,
): string {
  const parts: string[] = [];
  const formulation = notes?.formulation?.trim();
  const hypotheses = notes?.hypotheses?.trim();
  const observations = notes?.working_observations?.trim();
  if (formulation) {
    parts.push(formulation);
  }
  if (hypotheses) {
    parts.push(hypotheses);
  }
  if (observations) {
    parts.push(observations);
  }
  const extra = extraClinicianNotes?.trim();
  if (extra) {
    parts.push(extra);
  }
  return parts.join("\n\n");
}

export function hasUsefulClosingContext(transcript: string, clinicianNotes: string): boolean {
  return transcript.trim().length > 0 || clinicianNotes.trim().length > 0;
}

export function shouldAttachTranscriptToClosing(transcriptionAllowed: boolean): boolean {
  return transcriptionAllowed;
}
