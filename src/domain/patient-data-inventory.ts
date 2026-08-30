/**
 * Patient data-class inventory and LGPD elimination policies.
 * Legal basis keys are placeholders pending human legal review — they are
 * not automatic legal advice (docs/19-lgpd-privacy.md).
 */

export const ELIMINATION_POLICIES = ["DELETE", "ANONYMIZE", "RETAIN_WITH_LEGAL_REASON"] as const;
export type EliminationPolicy = (typeof ELIMINATION_POLICIES)[number];

export const VERIFY_STATUSES = [
  "eliminated",
  "partially_eliminated",
  "retained_by_policy",
  "failed",
] as const;
export type EliminationVerifyStatus = (typeof VERIFY_STATUSES)[number];

export interface PatientDataClassPolicy {
  dataClass: string;
  policy: EliminationPolicy;
  /** Configurable key — never treated as a validated legal opinion. */
  legalBasisKey: string | null;
  retentionYears: number | null;
  reviewYears: number | null;
  notes: string;
}

export const PATIENT_DATA_CLASS_POLICIES: PatientDataClassPolicy[] = [
  {
    dataClass: "patient_identifiers",
    policy: "ANONYMIZE",
    legalBasisKey: null,
    retentionYears: null,
    reviewYears: null,
    notes: "Nome, e-mail, telefone, CPF, nascimento, responsáveis.",
  },
  {
    dataClass: "patient_photo",
    policy: "DELETE",
    legalBasisKey: null,
    retentionYears: null,
    reviewYears: null,
    notes: "Retrato em Storage (patient-attachments).",
  },
  {
    dataClass: "patient_clinical_profile",
    policy: "RETAIN_WITH_LEGAL_REASON",
    legalBasisKey: "professional_record_retention_pending_review",
    retentionYears: 5,
    reviewYears: 5,
    notes: "Perfil clínico. Fundamento configurável; revisão jurídica pendente.",
  },
  {
    dataClass: "clinical_sessions",
    policy: "RETAIN_WITH_LEGAL_REASON",
    legalBasisKey: "professional_record_retention_pending_review",
    retentionYears: 5,
    reviewYears: 5,
    notes: "Sessões clínicas e metadados de atendimento.",
  },
  {
    dataClass: "session_dpep",
    policy: "RETAIN_WITH_LEGAL_REASON",
    legalBasisKey: "professional_record_retention_pending_review",
    retentionYears: 5,
    reviewYears: 5,
    notes: "DPEP — registro clínico estruturado.",
  },
  {
    dataClass: "session_clinical_working_notes",
    policy: "RETAIN_WITH_LEGAL_REASON",
    legalBasisKey: "professional_record_retention_pending_review",
    retentionYears: 5,
    reviewYears: 5,
    notes: "Área de trabalho clínico.",
  },
  {
    dataClass: "session_transcript_segments",
    policy: "RETAIN_WITH_LEGAL_REASON",
    legalBasisKey: "professional_record_retention_pending_review",
    retentionYears: 5,
    reviewYears: 5,
    notes: "Transcrição vinculada ao prontuário.",
  },
  {
    dataClass: "session_audio_fallback",
    policy: "DELETE",
    legalBasisKey: null,
    retentionYears: null,
    reviewYears: null,
    notes: "Áudio bruto de fallback em Storage.",
  },
  {
    dataClass: "appointments",
    policy: "ANONYMIZE",
    legalBasisKey: null,
    retentionYears: null,
    reviewYears: null,
    notes: "Agenda: remove nome do summary_snapshot; mantém o código público.",
  },
  {
    dataClass: "consents",
    policy: "RETAIN_WITH_LEGAL_REASON",
    legalBasisKey: "consent_evidence_pending_review",
    retentionYears: 5,
    reviewYears: 5,
    notes: "Prova de consentimento, inclusive TCLE.",
  },
  {
    dataClass: "consent_files",
    policy: "RETAIN_WITH_LEGAL_REASON",
    legalBasisKey: "consent_evidence_pending_review",
    retentionYears: 5,
    reviewYears: 5,
    notes: "PDF de TCLE em Storage.",
  },
  {
    dataClass: "documents_issued",
    policy: "RETAIN_WITH_LEGAL_REASON",
    legalBasisKey: "professional_record_retention_pending_review",
    retentionYears: 5,
    reviewYears: 5,
    notes: "Documentos emitidos/assinados/cancelados.",
  },
  {
    dataClass: "documents_draft",
    policy: "DELETE",
    legalBasisKey: null,
    retentionYears: null,
    reviewYears: null,
    notes: "Rascunhos não emitidos e arquivos associados.",
  },
  {
    dataClass: "patient_attachments",
    policy: "DELETE",
    legalBasisKey: null,
    retentionYears: null,
    reviewYears: null,
    notes: "Anexos pessoais em Storage.",
  },
  {
    dataClass: "ai_runs_artifacts",
    policy: "DELETE",
    legalBasisKey: null,
    retentionYears: null,
    reviewYears: null,
    notes: "Rascunhos de IA; o registro oficial é DPEP/notas quando anexado.",
  },
  {
    dataClass: "financial_plans",
    policy: "RETAIN_WITH_LEGAL_REASON",
    legalBasisKey: "accounting_fiscal_pending_review",
    retentionYears: 5,
    reviewYears: 5,
    notes: "Planos financeiros. Fundamento configurável.",
  },
  {
    dataClass: "financial_charges_payments",
    policy: "RETAIN_WITH_LEGAL_REASON",
    legalBasisKey: "accounting_fiscal_pending_review",
    retentionYears: 5,
    reviewYears: 5,
    notes: "Cobranças, pagamentos e recibos emitidos.",
  },
  {
    dataClass: "communication_preferences",
    policy: "DELETE",
    legalBasisKey: null,
    retentionYears: null,
    reviewYears: null,
    notes: "Preferências de canal WhatsApp.",
  },
  {
    dataClass: "whatsapp_messages",
    policy: "ANONYMIZE",
    legalBasisKey: null,
    retentionYears: null,
    reviewYears: null,
    notes: "Remove conteúdo e endereços; mantém metadados operacionais.",
  },
  {
    dataClass: "whatsapp_outbox",
    policy: "DELETE",
    legalBasisKey: null,
    retentionYears: null,
    reviewYears: null,
    notes: "Fila de lembretes pendentes.",
  },
  {
    dataClass: "logical_exports",
    policy: "DELETE",
    legalBasisKey: null,
    retentionYears: null,
    reviewYears: null,
    notes: "Pacotes de exportação lógica do paciente.",
  },
  {
    dataClass: "audit_events",
    policy: "RETAIN_WITH_LEGAL_REASON",
    legalBasisKey: "audit_trail_pending_review",
    retentionYears: null,
    reviewYears: 5,
    notes: "Trilha append-only. Sem expiração automática.",
  },
  {
    dataClass: "document_professional_signatures",
    policy: "RETAIN_WITH_LEGAL_REASON",
    legalBasisKey: "professional_record_retention_pending_review",
    retentionYears: 5,
    reviewYears: 5,
    notes: "Confirmação eletrônica interna vinculada a documento emitido. Não é ICP-Brasil.",
  },
  {
    dataClass: "patient_elimination_runs",
    policy: "RETAIN_WITH_LEGAL_REASON",
    legalBasisKey: "audit_trail_pending_review",
    retentionYears: null,
    reviewYears: 5,
    notes: "Metadado da execução do próprio plano. Não bloqueia o status eliminated.",
  },
];

export function policiesByKind(policy: EliminationPolicy): PatientDataClassPolicy[] {
  return PATIENT_DATA_CLASS_POLICIES.filter((item) => item.policy === policy);
}
