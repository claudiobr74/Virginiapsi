import { CLINICAL_PRINCIPLES_PROMPT } from "./core/clinical-principles";
import { CLINICAL_SAFETY_PROMPT } from "./core/safety";
import { UNCERTAINTY_PROMPT } from "./core/uncertainty";
import { EVIDENCE_BOUNDARY_PROMPT } from "./core/evidence-policy";
import { CONTEXT_AND_BIAS_PROMPT } from "./core/context-and-bias";
import { CLINICAL_CONTEXT_MODIFIERS_PROMPT } from "./core/clinical-context-modifiers";
import { ASSESSMENT_BOUNDARIES_PROMPT } from "./core/assessment-boundaries";
import { DOCUMENTATION_ETHICS_PROMPT } from "./core/documentation-ethics";
import { SESSION_LIVE_PROMPT } from "./session/live";
import { SESSION_PREPARATION_PROMPT } from "./session/preparation";
import { SESSION_CLOSING_PROMPT } from "./session/closing";
import { SUPERVISOR_PROMPT } from "./supervisor/supervisor";
import { SUPERVISOR_FORMULATION_PROMPT } from "./supervisor/formulation";
import { KNOWLEDGE_CORE_PROMPT } from "./knowledge/knowledge-core";
import { KNOWLEDGE_EVIDENCE_APPRAISAL_PROMPT } from "./knowledge/evidence-appraisal";
import { KNOWLEDGE_QUERY_PROMPT } from "./knowledge/query";
import { KNOWLEDGE_SYNTHESIS_PROMPT } from "./knowledge/synthesis";
import { KNOWLEDGE_COMPARE_SOURCES_PROMPT } from "./knowledge/compare-sources";
import { KNOWLEDGE_CLINICAL_APPLICATION_PROMPT } from "./knowledge/clinical-application";
import { KNOWLEDGE_STUDY_MODE_PROMPT } from "./knowledge/study-mode";
import { KNOWLEDGE_INGESTION_PROMPT } from "./knowledge/ingestion";
import { KNOWLEDGE_RETRIEVAL_PROMPT } from "./knowledge/retrieval";

export const RUNTIME_PROMPT_VERSION = "1.2.0" as const;

const CLINICAL_CORE = [
  CLINICAL_PRINCIPLES_PROMPT,
  CONTEXT_AND_BIAS_PROMPT,
  CLINICAL_CONTEXT_MODIFIERS_PROMPT,
  ASSESSMENT_BOUNDARIES_PROMPT,
  DOCUMENTATION_ETHICS_PROMPT,
  CLINICAL_SAFETY_PROMPT,
  UNCERTAINTY_PROMPT,
  EVIDENCE_BOUNDARY_PROMPT
].join("\n\n");

const KNOWLEDGE_CORE = [
  KNOWLEDGE_CORE_PROMPT,
  KNOWLEDGE_EVIDENCE_APPRAISAL_PROMPT,
  EVIDENCE_BOUNDARY_PROMPT
].join("\n\n");

export const RUNTIME_PROMPTS = {
  sessionLive: [CLINICAL_CORE, SESSION_LIVE_PROMPT].join("\n\n"),
  sessionPreparation: [CLINICAL_CORE, SESSION_PREPARATION_PROMPT].join("\n\n"),
  sessionClosing: [CLINICAL_CORE, SESSION_CLOSING_PROMPT].join("\n\n"),
  supervisor: [
    CLINICAL_CORE,
    SUPERVISOR_FORMULATION_PROMPT,
    SUPERVISOR_PROMPT
  ].join("\n\n"),
  knowledgeQuery: [KNOWLEDGE_CORE, KNOWLEDGE_QUERY_PROMPT].join("\n\n"),
  knowledgeSynthesis: [KNOWLEDGE_CORE, KNOWLEDGE_SYNTHESIS_PROMPT].join("\n\n"),
  knowledgeCompareSources: [
    KNOWLEDGE_CORE,
    KNOWLEDGE_COMPARE_SOURCES_PROMPT
  ].join("\n\n"),
  knowledgeClinicalApplication: [
    CLINICAL_CORE,
    KNOWLEDGE_CORE,
    KNOWLEDGE_CLINICAL_APPLICATION_PROMPT
  ].join("\n\n"),
  knowledgeStudyMode: [KNOWLEDGE_CORE, KNOWLEDGE_STUDY_MODE_PROMPT].join("\n\n"),
  knowledgeIngestion: [KNOWLEDGE_CORE_PROMPT, KNOWLEDGE_INGESTION_PROMPT].join("\n\n"),
  knowledgeRetrieval: [KNOWLEDGE_CORE_PROMPT, KNOWLEDGE_RETRIEVAL_PROMPT].join("\n\n")
} as const;

export type RuntimePromptName = keyof typeof RUNTIME_PROMPTS;
