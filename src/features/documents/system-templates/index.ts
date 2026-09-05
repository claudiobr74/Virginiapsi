import { declarationAttendance, declarationFollowUp } from "./declarations";
import { psychologicalCertificate } from "./certificates";
import {
  psychologicalReport,
  reportHealthPlan,
  reportMultiprofessional,
  reportSchool,
  reportToPhysician,
  reportToPsychiatrist,
} from "./reports";
import { psychologicalLaudo } from "./assessments";
import { psychologicalOpinion } from "./opinions";
import { referralGeneric, referralPsychiatry } from "./referrals";
import { psychotherapyContractComplete, psychotherapyContractOnline } from "./contracts";
import { minorAuthorization } from "./terms";
import { deliveryProtocol, documentRequest } from "./administrative";
import type { SystemTemplateDefinition } from "./types";

export const SYSTEM_DOCUMENT_TEMPLATES: SystemTemplateDefinition[] = [
  declarationAttendance,
  declarationFollowUp,
  psychologicalCertificate,
  psychologicalReport,
  reportToPhysician,
  reportToPsychiatrist,
  reportHealthPlan,
  reportSchool,
  reportMultiprofessional,
  psychologicalLaudo,
  psychologicalOpinion,
  referralGeneric,
  referralPsychiatry,
  psychotherapyContractComplete,
  psychotherapyContractOnline,
  minorAuthorization,
  documentRequest,
  deliveryProtocol,
];

const byKey = new Map(SYSTEM_DOCUMENT_TEMPLATES.map((template) => [template.key, template]));

export function getSystemTemplate(key: string): SystemTemplateDefinition | null {
  return byKey.get(key) ?? null;
}

export function listSystemTemplates(): SystemTemplateDefinition[] {
  return SYSTEM_DOCUMENT_TEMPLATES;
}

export function searchSystemTemplates(query: string): SystemTemplateDefinition[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return SYSTEM_DOCUMENT_TEMPLATES;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return SYSTEM_DOCUMENT_TEMPLATES.filter((template) => {
    const haystack = [
      template.name,
      template.description,
      template.category,
      template.documentKind,
      ...template.intendedRecipients,
      ...template.commonPurposes,
      ...template.searchTerms,
    ]
      .join(" ")
      .toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  }).sort((a, b) => {
    const aHit = a.name.toLowerCase().includes(normalized) ? 0 : 1;
    const bHit = b.name.toLowerCase().includes(normalized) ? 0 : 1;
    return aHit - bHit || a.name.localeCompare(b.name, "pt-BR");
  });
}

export {
  TEMPLATE_CATEGORY_LABELS,
  SYSTEM_TEMPLATE_CATEGORIES,
  type SystemTemplateCategory,
  type SystemTemplateDefinition,
  type TemplateBuildContext,
} from "./types";
