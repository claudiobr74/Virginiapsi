import type { LucideIcon } from "lucide-react";
import {
  FileCheck,
  FileText,
  LayoutGrid,
  ScrollText,
  Send,
} from "lucide-react";
import type { DocumentAiCommand, DocumentRow } from "@/features/documents/contracts";
import {
  getSystemTemplate,
  listSystemTemplates,
  type SystemTemplateCategory,
  type SystemTemplateDefinition,
} from "@/features/documents/system-templates";

export const HOME_SHORTCUTS: {
  id: string;
  category: SystemTemplateCategory | null;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    id: "declaracoes",
    category: "declaracoes",
    label: "Declaração",
    description: "Comparecimento ou acompanhamento",
    icon: FileText,
  },
  {
    id: "relatorios",
    category: "relatorios",
    label: "Relatório",
    description: "Comunicação técnica",
    icon: FileText,
  },
  {
    id: "atestados",
    category: "atestados",
    label: "Atestado",
    description: "Atestado psicológico",
    icon: FileCheck,
  },
  {
    id: "encaminhamentos",
    category: "encaminhamentos",
    label: "Encaminhamento",
    description: "Para outro profissional",
    icon: Send,
  },
  {
    id: "contratos",
    category: "contratos",
    label: "Contrato",
    description: "Acordos de psicoterapia",
    icon: ScrollText,
  },
  {
    id: "mais",
    category: null,
    label: "Mais modelos",
    description: "Ver o catálogo completo",
    icon: LayoutGrid,
  },
];

export const DOCUMENT_AI_INTENTS = [
  { id: "first_draft", label: "Criar uma primeira versão", command: undefined },
  { id: "improve", label: "Melhorar o texto", command: "melhorar clareza" },
  { id: "objective", label: "Deixar mais objetivo", command: "resumir" },
  { id: "technical", label: "Deixar mais técnico", command: "tornar mais técnico" },
  { id: "review", label: "Revisar o documento", command: "melhorar coesão" },
  { id: "other", label: "Outro...", command: undefined, needsNotes: true },
] as const;

export type DocumentAiIntentId = (typeof DOCUMENT_AI_INTENTS)[number]["id"];

export function templatesInCategory(category: SystemTemplateCategory): SystemTemplateDefinition[] {
  return listSystemTemplates().filter((template) => template.category === category);
}

export function shortcutHref(category: SystemTemplateCategory): string {
  const items = templatesInCategory(category);
  if (items.length === 1) {
    return `/app/documents/new?template=${items[0].key}`;
  }
  return `/app/documents/new?category=${category}`;
}

export function recentSystemTemplateKeys(documents: DocumentRow[], limit = 4): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const document of documents) {
    const key = document.system_template_key;
    if (!key || seen.has(key)) continue;
    if (!getSystemTemplate(key)) continue;
    seen.add(key);
    keys.push(key);
    if (keys.length >= limit) break;
  }
  return keys;
}

export function templateRequiresRecipient(template: SystemTemplateDefinition): boolean {
  return template.requiredData.includes("recipient.name");
}

export function templateRequiresPurpose(template: SystemTemplateDefinition): boolean {
  return template.requiredData.includes("document.purpose");
}

export function intentCommand(id: DocumentAiIntentId): DocumentAiCommand | undefined {
  const intent = DOCUMENT_AI_INTENTS.find((item) => item.id === id);
  return intent && "command" in intent ? (intent.command as DocumentAiCommand | undefined) : undefined;
}

export function intentNeedsNotes(id: DocumentAiIntentId): boolean {
  return DOCUMENT_AI_INTENTS.some((item) => item.id === id && "needsNotes" in item && item.needsNotes);
}

export function finalizeChecklistState(input: {
  patientId: string | null;
  allowsMissingPatient: boolean;
  purpose: string;
  purposeRequired: boolean;
  recipientName: string;
  recipientRequired: boolean;
  unresolved: boolean;
  reviewedAt: string | null;
  previewOk: boolean;
}) {
  return {
    patientOk: Boolean(input.patientId) || input.allowsMissingPatient,
    purposeOk: Boolean(input.purpose.trim()) || !input.purposeRequired,
    recipientOk: Boolean(input.recipientName.trim()) || !input.recipientRequired,
    placeholdersOk: !input.unresolved,
    reviewedOk: Boolean(input.reviewedAt),
    previewOk: input.previewOk,
  };
}

export function issueBlockedByUiGuards(input: {
  unresolved: boolean;
  previewOk: boolean;
  clinical: boolean;
  confirmReview: boolean;
  purposeAdequacy: boolean;
  requiresTechnicalFoundation: boolean;
  foundationOk: boolean;
  requiresCompatibleAssessment: boolean;
  assessmentOk: boolean;
}): boolean {
  if (input.unresolved || !input.previewOk) return true;
  if (input.clinical && (!input.confirmReview || !input.purposeAdequacy)) return true;
  if (input.requiresTechnicalFoundation && !input.foundationOk) return true;
  if (input.requiresCompatibleAssessment && !input.assessmentOk) return true;
  return false;
}
