export const CLINICAL_DELETE_BLOCKED =
  "Este agendamento já possui registro clínico associado e não pode ser excluído. Você pode cancelá-lo.";

/** Application-level hard-delete guard. Does not write clinical records. */
export function hardDeleteBlockedReason(hasClinicalRecord: boolean): string | null {
  return hasClinicalRecord ? CLINICAL_DELETE_BLOCKED : null;
}
