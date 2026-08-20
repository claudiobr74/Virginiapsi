"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { RUNTIME_PROMPTS, RUNTIME_PROMPT_VERSION } from "@/lib/ai/prompts";
import {
  SESSION_CLOSING_SCHEMA,
  SESSION_LIVE_SCHEMA,
  SESSION_PREPARATION_SCHEMA,
} from "@/lib/ai/contracts/session";
import {
  sessionClosingOutputSchema,
  sessionLiveOutputSchema,
  sessionPreparationOutputSchema,
} from "@/lib/ai/validators/session";
import { toGeminiResponseJsonSchema } from "@/lib/ai/schema-adapter";
import { GeminiClient } from "@/lib/integrations/gemini/client";
import { getServerEnv } from "@/lib/env/server";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPatient } from "@/features/patients/queries";
import {
  getClinicalSession,
  getSessionDpep,
  listPatientSessions,
  listTranscriptSegments,
} from "@/features/sessions/queries";
import {
  buildSessionClosingContext,
  buildSessionLiveContext,
  buildSessionPreparationContext,
  type SessionClosingInput,
  type SessionLiveInput,
  type SessionPreparationInput,
} from "@/features/sessions/ai/dto";
import { authorizeSessionAi, type SessionAiPurpose } from "@/features/sessions/ai/gate";

export interface SessionAiActionResult {
  error?: string;
  artifactId?: string;
  content?: unknown;
}

interface RunSessionAiCallArgs<T> {
  organizationId: string;
  patientId: string;
  sessionId: string | null;
  purpose: SessionAiPurpose;
  promptName: string;
  systemInstruction: string;
  userContent: string;
  responseJsonSchema: unknown;
  validate: (data: unknown) => T;
  consentVersion?: string;
}

async function runSessionAiCall<T>(args: RunSessionAiCallArgs<T>): Promise<SessionAiActionResult> {
  const supabase = await createSupabaseServerClient();
  const env = getServerEnv();

  const { data: run, error: runError } = await supabase
    .from("ai_runs")
    .insert({
      organization_id: args.organizationId,
      patient_id: args.patientId,
      session_id: args.sessionId,
      purpose: args.purpose,
      provider: "gemini",
      model: env.GEMINI_MODEL_SESSION,
      prompt_name: args.promptName,
      prompt_version: RUNTIME_PROMPT_VERSION,
      schema_version: RUNTIME_PROMPT_VERSION,
      consent_version: args.consentVersion ?? null,
      status: "running",
    })
    .select("id")
    .single();

  if (runError || !run) {
    return { error: "Não foi possível registrar a execução de IA." };
  }

  try {
    const client = new GeminiClient({ apiKey: env.GEMINI_API_KEY });
    const raw = await client.generateStructured({
      model: env.GEMINI_MODEL_SESSION,
      systemInstruction: args.systemInstruction,
      userContent: args.userContent,
      responseJsonSchema: toGeminiResponseJsonSchema(args.responseJsonSchema),
    });

    const validated = args.validate(raw);

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
      throw new Error("failed to persist ai artifact");
    }

    await supabase
      .from("ai_runs")
      .update({ status: "succeeded", completed_at: new Date().toISOString() })
      .eq("id", run.id);

    return { artifactId: artifact.id, content: validated };
  } catch (error) {
    await supabase
      .from("ai_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        // Never the prompt/transcript/response text — just enough to debug
        // an integration failure (docs/14-runtime-ai-architecture.md §12).
        error_message: error instanceof Error ? error.name : "unknown_error",
      })
      .eq("id", run.id);

    return {
      error:
        "A IA não retornou um resultado válido agora. Nenhum conteúdo foi salvo (falha fechada).",
    };
  }
}

export async function runSessionLiveAssist(
  sessionId: string,
  clinicianNotes?: string,
): Promise<SessionAiActionResult> {
  const { organizationId } = await requireOrgContext();
  const session = await getClinicalSession(organizationId, sessionId);
  if (!session) {
    return { error: "Sessão não encontrada." };
  }

  const gate = await authorizeSessionAi(session.patient_id, "session_live");
  if (!gate.allowed) {
    return { error: gate.message };
  }

  const patient = await getPatient(organizationId, session.patient_id);
  if (!patient) {
    return { error: "Paciente não encontrado." };
  }

  const segments = await listTranscriptSegments(sessionId);
  const transcriptWindow = segments
    .map((segment) => segment.text)
    .join(" ")
    .trim();
  if (!transcriptWindow) {
    return { error: "Ainda não há transcrição disponível nesta sessão." };
  }

  const lowConfidenceCount = segments.filter(
    (segment) => segment.ambiguity_flags?.lowConfidence,
  ).length;

  const input: SessionLiveInput = {
    organizationId,
    patientRef: { displayLabel: patient.preferred_name },
    sessionId,
    consentState: gate.consentState,
    transcriptWindow,
    transcriptQuality: {
      isPartial: session.status === "in_progress",
      confidenceAvailable: segments.some((segment) => segment.provider_confidence !== null),
      knownAmbiguities:
        lowConfidenceCount > 0 ? [`${lowConfidenceCount} trecho(s) de baixa confiança`] : [],
    },
    clinicianNotes,
  };

  return runSessionAiCall({
    organizationId,
    patientId: session.patient_id,
    sessionId,
    purpose: "session_live",
    promptName: "sessionLive",
    systemInstruction: RUNTIME_PROMPTS.sessionLive,
    userContent: buildSessionLiveContext(input),
    responseJsonSchema: SESSION_LIVE_SCHEMA,
    validate: (data) => sessionLiveOutputSchema.parse(data),
    consentVersion: gate.consentState.consentVersion,
  });
}

export async function runSessionPreparationAssist(
  patientId: string,
): Promise<SessionAiActionResult> {
  const { organizationId } = await requireOrgContext();

  const gate = await authorizeSessionAi(patientId, "session_preparation");
  if (!gate.allowed) {
    return { error: gate.message };
  }

  const patient = await getPatient(organizationId, patientId);
  if (!patient) {
    return { error: "Paciente não encontrado." };
  }

  const pastSessions = await listPatientSessions(organizationId, patientId);
  const finalized = pastSessions.filter((session) => session.status === "finalized").slice(0, 3);
  if (finalized.length === 0) {
    return { error: "Não há sessões finalizadas para preparar continuidade." };
  }

  const dpepEntries = await Promise.all(
    finalized.map(async (session) => ({ session, dpep: await getSessionDpep(session.id) })),
  );
  const selectedSessions = dpepEntries
    .map(
      ({ session, dpep }) =>
        `Sessão de ${session.started_at ?? session.created_at}:\n` +
        `Demanda: ${dpep?.demand ?? "—"}\nEvolução: ${dpep?.evolution ?? "—"}\nPlano: ${dpep?.plan ?? "—"}`,
    )
    .join("\n\n");

  const input: SessionPreparationInput = {
    organizationId,
    patientRef: { displayLabel: patient.preferred_name },
    selectedSessions,
    previousPlans: dpepEntries[0]?.dpep?.plan ?? undefined,
  };

  return runSessionAiCall({
    organizationId,
    patientId,
    sessionId: null,
    purpose: "session_preparation",
    promptName: "sessionPreparation",
    systemInstruction: RUNTIME_PROMPTS.sessionPreparation,
    userContent: buildSessionPreparationContext(input),
    responseJsonSchema: SESSION_PREPARATION_SCHEMA,
    validate: (data) => sessionPreparationOutputSchema.parse(data),
    consentVersion: gate.consentState.consentVersion,
  });
}

export async function runSessionClosingAssist(
  sessionId: string,
  input: { clinicianNotes?: string; interventionsActuallyRecorded?: string },
): Promise<SessionAiActionResult> {
  const { organizationId } = await requireOrgContext();
  const session = await getClinicalSession(organizationId, sessionId);
  if (!session) {
    return { error: "Sessão não encontrada." };
  }

  const gate = await authorizeSessionAi(session.patient_id, "session_closing");
  if (!gate.allowed) {
    return { error: gate.message };
  }

  const patient = await getPatient(organizationId, session.patient_id);
  if (!patient) {
    return { error: "Paciente não encontrado." };
  }

  const segments = await listTranscriptSegments(sessionId);
  const finalTranscriptOrSummary = segments
    .map((segment) => segment.text)
    .join(" ")
    .trim();
  if (!finalTranscriptOrSummary) {
    return { error: "Ainda não há transcrição disponível nesta sessão." };
  }

  const priorSessions = (await listPatientSessions(organizationId, session.patient_id)).filter(
    (candidate) => candidate.status === "finalized",
  );
  const priorDpep = priorSessions[0] ? await getSessionDpep(priorSessions[0].id) : null;

  const closingInput: SessionClosingInput = {
    organizationId,
    patientRef: { displayLabel: patient.preferred_name },
    sessionId,
    finalTranscriptOrSummary,
    clinicianNotes: input.clinicianNotes,
    interventionsActuallyRecorded: input.interventionsActuallyRecorded,
    priorPlan: priorDpep?.plan ?? undefined,
  };

  return runSessionAiCall({
    organizationId,
    patientId: session.patient_id,
    sessionId,
    purpose: "session_closing",
    promptName: "sessionClosing",
    systemInstruction: RUNTIME_PROMPTS.sessionClosing,
    userContent: buildSessionClosingContext(closingInput),
    responseJsonSchema: SESSION_CLOSING_SCHEMA,
    validate: (data) => sessionClosingOutputSchema.parse(data),
    consentVersion: gate.consentState.consentVersion,
  });
}

const appendArtifactSchema = z.object({
  artifactId: z.string().uuid(),
  sessionId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
});

/**
 * Human-in-the-loop: copies a `session_closing` artifact's dpepDraft into
 * session_dpep only on this explicit action, going through the same
 * optimistic-concurrency path a manual DPEP edit would
 * (docs/14-runtime-ai-architecture.md §10 "nenhum auto-commit").
 */
export async function appendClosingArtifactToDpep(
  input: unknown,
): Promise<SessionAiActionResult> {
  const { organizationId, role } = await requireOrgContext();
  if (role !== "psychologist_admin") {
    return { error: "forbidden_role" };
  }
  const parsed = appendArtifactSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "invalid_request" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: artifact, error: artifactError } = await supabase
    .from("ai_artifacts")
    .select("id, type, structured_content, review_status")
    .eq("id", parsed.data.artifactId)
    .maybeSingle();

  if (artifactError || !artifact || artifact.type !== "session_closing") {
    return { error: "Rascunho de IA não encontrado." };
  }
  if (artifact.review_status !== "pending") {
    return { error: "Este rascunho já foi revisado." };
  }

  const dpepDraft = (
    artifact.structured_content as { dpepDraft?: Record<string, string> }
  ).dpepDraft;

  const { data: saveResult, error: saveError } = await supabase.rpc("save_session_dpep", {
    p_session_id: parsed.data.sessionId,
    org_id: organizationId,
    p_expected_version: parsed.data.expectedVersion,
    p_demand: dpepDraft?.demanda ?? null,
    p_procedures: dpepDraft?.procedimentos ?? null,
    p_evolution: dpepDraft?.evolucao ?? null,
    p_plan: dpepDraft?.plano ?? null,
  });

  const rows = (saveResult ?? []) as { new_version: number }[];
  if (saveError || rows.length === 0) {
    return { error: "Não foi possível salvar — a sessão pode ter sido alterada. Recarregue." };
  }

  await supabase
    .from("ai_artifacts")
    .update({ review_status: "appended" })
    .eq("id", parsed.data.artifactId);

  await logAuditEvent({
    organizationId,
    action: "ai_artifact.appended_to_dpep",
    resourceType: "clinical_session",
    resourceId: parsed.data.sessionId,
  });

  revalidatePath(`/session/${parsed.data.sessionId}`);
  return { artifactId: parsed.data.artifactId };
}

export async function discardAiArtifact(artifactId: string): Promise<SessionAiActionResult> {
  const { role } = await requireOrgContext();
  if (role !== "psychologist_admin") {
    return { error: "forbidden_role" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("ai_artifacts")
    .update({ review_status: "discarded" })
    .eq("id", artifactId)
    .eq("review_status", "pending");

  if (error) {
    return { error: "Não foi possível descartar agora." };
  }
  return { artifactId };
}
