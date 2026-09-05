import type { DocumentKind, DocumentSection, VisualProfile } from "@/features/documents/contracts";

export const SYSTEM_TEMPLATE_CATEGORIES = [
  "declaracoes",
  "atestados",
  "relatorios",
  "avaliacao",
  "pareceres",
  "encaminhamentos",
  "contratos",
  "termos",
  "administrativos",
] as const;
export type SystemTemplateCategory = (typeof SYSTEM_TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_CATEGORY_LABELS: Record<SystemTemplateCategory, string> = {
  declaracoes: "Declarações",
  atestados: "Atestados",
  relatorios: "Relatórios",
  avaliacao: "Avaliação",
  pareceres: "Pareceres",
  encaminhamentos: "Encaminhamentos",
  contratos: "Contratos",
  termos: "Termos e autorizações",
  administrativos: "Administrativos",
};

export interface SystemTemplateGuardrails {
  requiresPatient: boolean;
  requiresTechnicalFoundation?: boolean;
  requiresCompatibleAssessment?: boolean;
  allowsMissingPatient: boolean;
  neverInvent: string[];
  issuanceChecklist: string[];
}

export interface SystemTemplateDefinition {
  key: string;
  version: string;
  name: string;
  description: string;
  category: SystemTemplateCategory;
  documentKind: DocumentKind;
  intendedRecipients: string[];
  commonPurposes: string[];
  recommendedLength: "objetivo" | "completo" | "detalhado";
  defaultVisualProfile: VisualProfile;
  supportsCover: boolean;
  supportsBooklet?: boolean;
  searchTerms: string[];
  requiredData: string[];
  optionalData: string[];
  requiredSections: string[];
  optionalSections: string[];
  regulatoryGuidance: string;
  guardrails: SystemTemplateGuardrails;
  aiInstructions: string;
  interviewPrompts: string[];
  buildSections: (context: TemplateBuildContext) => DocumentSection[];
}

export interface TemplateBuildContext {
  patientName?: string;
  preferredName?: string;
  professionalName?: string;
  organizationName?: string;
  today: string;
  purpose?: string;
  recipientName?: string;
  cancellationNoticeHours?: number;
  extra?: Record<string, string>;
}

export function section(
  order: number,
  title: string,
  content: string,
  type: DocumentSection["type"] = "text",
  pageBreakBefore = false,
): DocumentSection {
  return {
    id: `${order}-${title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}`,
    type,
    title,
    content: content.trim(),
    order,
    enabled: true,
    pageBreakBefore,
  };
}

export const NEVER_INVENT_BASE = [
  "diagnóstico",
  "CID",
  "DSM",
  "sintomas não registrados",
  "fatos",
  "datas",
  "sessões",
  "testes",
  "técnicas",
  "resultados",
  "medicamentos",
  "profissionais",
  "acontecimentos",
  "referências bibliográficas",
];
