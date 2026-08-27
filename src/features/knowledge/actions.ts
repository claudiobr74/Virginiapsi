"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { RUNTIME_PROMPTS, RUNTIME_PROMPT_VERSION, RUNTIME_SCHEMA_VERSION } from "@/lib/ai/prompts";
import { KNOWLEDGE_SCHEMA } from "@/lib/ai/contracts/knowledge";
import { knowledgeOutputSchema, type KnowledgeOutput } from "@/lib/ai/validators/knowledge";
import { toGeminiResponseJsonSchema } from "@/lib/ai/schema-adapter";
import { GeminiClient } from "@/lib/integrations/gemini/client";
import { getServerEnv } from "@/lib/env/server";
import { isClinicalPractitioner } from "@/features/organizations/roles";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPatient } from "@/features/patients/queries";
import { authorizeSupervisorAi } from "@/features/supervisor/gate";
import { retrieveChunks } from "@/features/knowledge/retrieval";
import { ingestKnowledgeSource } from "@/features/knowledge/ingestion";
import { findFabricatedCitations } from "@/features/knowledge/citation-validator";
import { buildApplyToCaseContext, buildKnowledgeContext } from "@/features/knowledge/dto";
import {
  applyToCaseSchema,
  askKnowledgeSchema,
  compareKnowledgeSourcesSchema,
  createCollectionSchema,
  registerSourceSchema,
  studyKnowledgeSchema,
  synthesizeKnowledgeSchema,
} from "@/features/knowledge/contracts";
import { AI_RATE_LIMIT_MESSAGE, consumeAiRateLimit } from "@/lib/security/rate-limit";

export interface KnowledgeActionResult {
  error?: string;
  id?: string;
  runId?: string;
  artifactId?: string;
  content?: KnowledgeOutput;
}

async function requireClinicalPractitioner() {
  const { organizationId, role, user } = await requireOrgContext();
  if (!isClinicalPractitioner(role)) {
    throw new Error("forbidden_role");
  }
  return { organizationId, userId: user.id };
}

function rejectIfAiRateLimited(
  organizationId: string,
  userId: string,
): KnowledgeActionResult | null {
  const rate = consumeAiRateLimit(organizationId, userId);
  if (!rate.allowed) {
    return { error: AI_RATE_LIMIT_MESSAGE };
  }
  return null;
}

function rejectIfNoChunks(
  chunks: { sourceId: string }[],
): KnowledgeActionResult | null {
  if (chunks.length === 0) {
    return {
      error: "Não há trechos recuperados na biblioteca para esta consulta.",
    };
  }
  return null;
}

export async function createCollectionAction(input: unknown): Promise<KnowledgeActionResult> {
  const { organizationId } = await requireClinicalPractitioner();
  const parsed = createCollectionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("knowledge_collections")
    .insert({
      organization_id: organizationId,
      name: parsed.data.name,
      description: parsed.data.description || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Não foi possível criar a coleção agora." };
  }
  revalidatePath("/app/knowledge");
  return { id: data.id };
}

/** Path convention: knowledge-sources/{organizationId}/{uuid}/{filename}. */
export async function buildKnowledgeUploadPath(filename: string): Promise<string> {
  const { organizationId } = await requireClinicalPractitioner();
  const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  return `${organizationId}/${randomUUID()}/${safeName}`;
}

export async function registerSourceAction(input: unknown): Promise<KnowledgeActionResult> {
  const { organizationId } = await requireClinicalPractitioner();
  const parsed = registerSourceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!parsed.data.storagePath.startsWith(`${organizationId}/`)) {
    return { error: "Caminho de upload inválido." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("knowledge_sources")
    .insert({
      organization_id: organizationId,
      collection_id: parsed.data.collectionId || null,
      title: parsed.data.title || null,
      storage_path: parsed.data.storagePath,
      mime_type: parsed.data.mimeType,
      byte_size: parsed.data.byteSize,
      sha256: parsed.data.sha256,
      status: "uploaded",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Não foi possível registrar a fonte agora." };
  }

  const result = await ingestKnowledgeSource(organizationId, data.id);
  revalidatePath("/app/knowledge");
  if (!result.ok) {
    return { id: data.id, error: "Fonte enviada, mas o processamento falhou. Você pode tentar de novo." };
  }
  return { id: data.id };
}

export async function retryIngestionAction(sourceId: string): Promise<KnowledgeActionResult> {
  const { organizationId } = await requireClinicalPractitioner();
  const result = await ingestKnowledgeSource(organizationId, sourceId);
  revalidatePath("/app/knowledge");
  if (!result.ok) {
    return { error: "O processamento falhou de novo. Verifique o arquivo." };
  }
  return { id: sourceId };
}

export async function deleteSourceAction(sourceId: string): Promise<KnowledgeActionResult> {
  const { organizationId } = await requireClinicalPractitioner();
  const supabase = await createSupabaseServerClient();
  const { data: source } = await supabase
    .from("knowledge_sources")
    .select("storage_path")
    .eq("id", sourceId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  await supabase
    .from("knowledge_sources")
    .delete()
    .eq("id", sourceId)
    .eq("organization_id", organizationId);
  if (source?.storage_path) {
    await supabase.storage.from("knowledge-sources").remove([source.storage_path]);
  }
  revalidatePath("/app/knowledge");
  return { id: sourceId };
}

interface RunKnowledgeCallArgs {
  organizationId: string;
  purpose:
    | "knowledge_query"
    | "knowledge_synthesis"
    | "knowledge_compare_sources"
    | "knowledge_study_mode"
    | "knowledge_clinical_application";
  promptName: string;
  systemInstruction: string;
  userContent: string;
  retrievedSourceIds: string[];
  patientId?: string;
  consentVersion?: string;
}

async function runKnowledgeCall(args: RunKnowledgeCallArgs): Promise<KnowledgeActionResult> {
  const supabase = await createSupabaseServerClient();
  const env = getServerEnv();

  const { data: run, error: runError } = await supabase
    .from("ai_runs")
    .insert({
      organization_id: args.organizationId,
      patient_id: args.patientId ?? null,
      purpose: args.purpose,
      provider: "gemini",
      model: env.GEMINI_MODEL_KNOWLEDGE,
      prompt_name: args.promptName,
      prompt_version: RUNTIME_PROMPT_VERSION,
      schema_version: RUNTIME_SCHEMA_VERSION,
      consent_version: args.consentVersion ?? null,
      status: "running",
      source_ids: { sourceIds: args.retrievedSourceIds },
    })
    .select("id")
    .single();

  if (runError || !run) {
    return { error: "Não foi possível registrar a execução de IA." };
  }

  try {
    const client = new GeminiClient({ apiKey: env.GEMINI_API_KEY });
    const raw = await client.generateStructured({
      model: env.GEMINI_MODEL_KNOWLEDGE,
      systemInstruction: args.systemInstruction,
      userContent: args.userContent,
      responseJsonSchema: toGeminiResponseJsonSchema(KNOWLEDGE_SCHEMA),
    });
    const validated = knowledgeOutputSchema.parse(raw);

    const fabricated = findFabricatedCitations(validated, args.retrievedSourceIds);
    if (fabricated.length > 0) {
      throw new Error(`fabricated citations: ${fabricated.join(", ")}`);
    }

    const { data: artifact, error: artifactError } = await supabase
      .from("ai_artifacts")
      .insert({
        run_id: run.id,
        organization_id: args.organizationId,
        type: args.purpose,
        structured_content: validated,
      })
      .select("id")
      .single();
    if (artifactError || !artifact) {
      throw new Error("failed to persist knowledge artifact");
    }

    await supabase
      .from("ai_runs")
      .update({ status: "succeeded", completed_at: new Date().toISOString() })
      .eq("id", run.id);

    return { runId: run.id, artifactId: artifact.id, content: validated };
  } catch (error) {
    await supabase
      .from("ai_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.name : "unknown_error",
      })
      .eq("id", run.id);
    return {
      error: "A IA não retornou um resultado válido agora. Nenhum conteúdo foi salvo (falha fechada).",
    };
  }
}

export async function askKnowledgeAction(input: unknown): Promise<KnowledgeActionResult> {
  const { organizationId, userId } = await requireClinicalPractitioner();
  const parsed = askKnowledgeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const limited = rejectIfAiRateLimited(organizationId, userId);
  if (limited) {
    return limited;
  }

  const chunks = await retrieveChunks(organizationId, parsed.data.question, {
    collectionIds: parsed.data.collectionIds,
  });
  const empty = rejectIfNoChunks(chunks);
  if (empty) {
    return empty;
  }

  return runKnowledgeCall({
    organizationId,
    purpose: "knowledge_query",
    promptName: "knowledgeQuery",
    systemInstruction: RUNTIME_PROMPTS.knowledgeQuery,
    userContent: buildKnowledgeContext({
      organizationId,
      collectionIds: parsed.data.collectionIds,
      question: parsed.data.question,
      mode: "query",
      retrievedChunks: chunks,
    }),
    retrievedSourceIds: chunks.map((chunk) => chunk.sourceId),
  });
}

export async function synthesizeKnowledgeAction(input: unknown): Promise<KnowledgeActionResult> {
  const { organizationId, userId } = await requireClinicalPractitioner();
  const parsed = synthesizeKnowledgeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const limited = rejectIfAiRateLimited(organizationId, userId);
  if (limited) {
    return limited;
  }

  const chunks = await retrieveChunks(organizationId, parsed.data.topic, {
    collectionIds: parsed.data.collectionIds,
    matchCount: 12,
  });
  const empty = rejectIfNoChunks(chunks);
  if (empty) {
    return empty;
  }

  return runKnowledgeCall({
    organizationId,
    purpose: "knowledge_synthesis",
    promptName: "knowledgeSynthesis",
    systemInstruction: RUNTIME_PROMPTS.knowledgeSynthesis,
    userContent: buildKnowledgeContext({
      organizationId,
      collectionIds: parsed.data.collectionIds,
      question: parsed.data.topic,
      mode: "synthesis",
      retrievedChunks: chunks,
    }),
    retrievedSourceIds: chunks.map((chunk) => chunk.sourceId),
  });
}

export async function compareKnowledgeSourcesAction(
  input: unknown,
): Promise<KnowledgeActionResult> {
  const { organizationId, userId } = await requireClinicalPractitioner();
  const parsed = compareKnowledgeSourcesSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const limited = rejectIfAiRateLimited(organizationId, userId);
  if (limited) {
    return limited;
  }

  const supabase = await createSupabaseServerClient();
  const { data: chunkRows, error } = await supabase
    .from("knowledge_chunks")
    .select("id, source_id, text, char_start, char_end")
    .in("source_id", parsed.data.sourceIds)
    .order("sequence", { ascending: true })
    .limit(40);
  if (error) {
    return { error: "Não foi possível carregar as fontes selecionadas." };
  }

  const { data: sources } = await supabase
    .from("knowledge_sources")
    .select("id, title, authors, year, document_type, study_design_or_source_role")
    .in("id", parsed.data.sourceIds);
  const sourceById = new Map((sources ?? []).map((source) => [source.id, source]));

  const chunks = (chunkRows ?? []).map((row) => {
    const source = sourceById.get(row.source_id);
    return {
      chunkId: row.id,
      sourceId: row.source_id,
      title: source?.title ?? undefined,
      author: source?.authors?.length ? source.authors.join(", ") : undefined,
      year: source?.year ?? undefined,
      documentType: source?.document_type ?? undefined,
      studyDesignOrSourceRole: source?.study_design_or_source_role ?? undefined,
      location: row.char_start !== null ? `chars ${row.char_start}-${row.char_end}` : undefined,
      text: row.text,
      retrievalScore: 1,
    };
  });

  const empty = rejectIfNoChunks(chunks);
  if (empty) {
    return empty;
  }

  return runKnowledgeCall({
    organizationId,
    purpose: "knowledge_compare_sources",
    promptName: "knowledgeCompareSources",
    systemInstruction: RUNTIME_PROMPTS.knowledgeCompareSources,
    userContent: buildKnowledgeContext({
      organizationId,
      collectionIds: [],
      question: parsed.data.question,
      mode: "compare",
      retrievedChunks: chunks,
    }),
    retrievedSourceIds: chunks.map((chunk) => chunk.sourceId),
  });
}

export async function studyKnowledgeAction(input: unknown): Promise<KnowledgeActionResult> {
  const { organizationId, userId } = await requireClinicalPractitioner();
  const parsed = studyKnowledgeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const limited = rejectIfAiRateLimited(organizationId, userId);
  if (limited) {
    return limited;
  }

  const chunks = await retrieveChunks(organizationId, parsed.data.topic, {
    collectionIds: parsed.data.collectionIds,
    matchCount: 12,
  });
  const empty = rejectIfNoChunks(chunks);
  if (empty) {
    return empty;
  }

  return runKnowledgeCall({
    organizationId,
    purpose: "knowledge_study_mode",
    promptName: "knowledgeStudyMode",
    systemInstruction: RUNTIME_PROMPTS.knowledgeStudyMode,
    userContent: buildKnowledgeContext({
      organizationId,
      collectionIds: parsed.data.collectionIds,
      question: `Formato solicitado: ${parsed.data.format}. Tema: ${parsed.data.topic}`,
      mode: "study",
      retrievedChunks: chunks,
    }),
    retrievedSourceIds: chunks.map((chunk) => chunk.sourceId),
  });
}

/**
 * Apply-to-Case: explicit opt-in only, same aiProcessingAllowed consent
 * gate as Supervisor (docs/16 §Apply to Case Input), minimized clinical
 * context, and patient data never touches the library/collections.
 */
export async function applyToCaseAction(input: unknown): Promise<KnowledgeActionResult> {
  const { organizationId, userId } = await requireClinicalPractitioner();
  const parsed = applyToCaseSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const gate = await authorizeSupervisorAi(parsed.data.patientId);
  if (!gate.allowed) {
    return { error: gate.message };
  }

  const limited = rejectIfAiRateLimited(organizationId, userId);
  if (limited) {
    return limited;
  }

  const patient = await getPatient(organizationId, parsed.data.patientId);
  if (!patient) {
    return { error: "Paciente não encontrado." };
  }

  const chunks = await retrieveChunks(organizationId, parsed.data.question, {
    collectionIds: parsed.data.collectionIds,
  });
  const empty = rejectIfNoChunks(chunks);
  if (empty) {
    return empty;
  }

  return runKnowledgeCall({
    organizationId,
    purpose: "knowledge_clinical_application",
    promptName: "knowledgeClinicalApplication",
    systemInstruction: RUNTIME_PROMPTS.knowledgeClinicalApplication,
    patientId: parsed.data.patientId,
    consentVersion: gate.consentState.consentVersion,
    userContent: buildApplyToCaseContext({
      organizationId,
      patientRef: { displayLabel: patient.preferred_name },
      question: parsed.data.question,
      minimizedCaseContext: `Modalidade: ${patient.modality}.`,
      retrievedChunks: chunks,
      explicitApplyToCase: true,
    }),
    retrievedSourceIds: chunks.map((chunk) => chunk.sourceId),
  });
}
