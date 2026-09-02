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
  sessionLiveOutputSchema,
  sessionPreparationOutputSchema,
} from "@/lib/ai/validators/session";
import { toGeminiResponseJsonSchema } from "@/lib/ai/schema-adapter";
import { GeminiApiError, GeminiClient } from "@/lib/integrations/gemini/client";
import { getSessionAiEnv } from "@/lib/env/server";
import { envIssueKeyNames } from "@/lib/env/schema";
import { isClinicalPractitioner } from "@/features/organizations/roles";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPatient } from "@/features/patients/queries";
import {
  getClinicalSession,
  getSessionDpep,
  getSessionWorkingNotes,
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
import { authorizeSessionAi } from "@/features/sessions/ai/gate";
import type { SessionAiPurpose } from "@/features/sessions/ai/purpose";
import type { SessionAiActionResult } from "@/features/sessions/ai/action-result";
import { catchSessionAiFailure } from "@/features/sessions/ai/safe-action";
import {
  classifyAiRunInsertError,
  classifySessionAiError,
  publicMessageForSessionAiError,
} from "@/features/sessions/ai/session-ai-errors";
import { logSessionAiStage } from "@/features/sessions/ai/session-ai-log";
import { coerceSessionClosingOutput } from "@/features/sessions/ai/dpep-draft";
import {
  closingPatientRef,
  formatWorkingNotesForClosing,
  hasUsefulClosingContext,
  selectPersistedTranscriptText,
  shouldAttachTranscriptToClosing,
} from "@/features/sessions/ai/closing-context";
import { SESSION_AI_EMPTY_CONTEXT_MESSAGE } from "@/features/sessions/ai/messages";
import { AI_RATE_LIMIT_MESSAGE, consumeAiRateLimit } from "@/lib/security/rate-limit";

export type { SessionAiActionResult } from "@/features/sessions/ai/action-result";

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
  correlationId: string;
  started: number;
}

function elapsed(started: number): number {
  return Date.now() - started;
}

async function runSessionAiCall<T>(args: RunSessionAiCallArgs<T>): Promise<SessionAiActionResult> {
  const { correlationId, purpose } = args;

  let env;
  try {
    env = getSessionAiEnv();
  } catch (error) {
    logSessionAiStage({
      event: "session_ai_failed",
      correlationId,
      purpose,
      stage: "env",
      errorKind: "env",
      missingEnvKeys: envIssueKeyNames(error),
      durationMs: elapsed(args.started),
    });
    return {
      error: publicMessageForSessionAiError(purpose, "env"),
      correlationId,
    };
  }

  logSessionAiStage({
    event: "session_ai_env_ready",
    correlationId,
    purpose,
    model: env.GEMINI_MODEL_SESSION,
    durationMs: elapsed(args.started),
  });

  const supabase = await createSupabaseServerClient();

  logSessionAiStage({
    event: "session_ai_run_insert_started",
    correlationId,
    purpose,
    model: env.GEMINI_MODEL_SESSION,
    durationMs: elapsed(args.started),
  });

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
    const db = classifyAiRunInsertError(runError);
    logSessionAiStage({
      event: "session_ai_failed",
      correlationId,
      purpose,
      stage: "ai_run_insert",
      errorKind: "ai_run_insert_failed",
      dbCode: db.dbCode,
      constraint: db.constraint,
      model: env.GEMINI_MODEL_SESSION,
      durationMs: elapsed(args.started),
    });
    return {
      error: publicMessageForSessionAiError(purpose, "ai_run_insert_failed"),
      correlationId,
    };
  }

  logSessionAiStage({
    event: "session_ai_run_insert_succeeded",
    correlationId,
    purpose,
    model: env.GEMINI_MODEL_SESSION,
    durationMs: elapsed(args.started),
  });

  try {
    logSessionAiStage({
      event: "session_ai_gemini_started",
      correlationId,
      purpose,
      model: env.GEMINI_MODEL_SESSION,
      durationMs: elapsed(args.started),
    });

    const client = new GeminiClient({ apiKey: env.GEMINI_API_KEY });
    const raw = await client.generateStructured({
      model: env.GEMINI_MODEL_SESSION,
      systemInstruction: args.systemInstruction,
      userContent: args.userContent,
      responseJsonSchema: toGeminiResponseJsonSchema(args.responseJsonSchema),
    });

    logSessionAiStage({
      event: "session_ai_gemini_succeeded",
      correlationId,
      purpose,
      model: env.GEMINI_MODEL_SESSION,
      durationMs: elapsed(args.started),
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
      const db = classifyAiRunInsertError(artifactError);
      await supabase
        .from("ai_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: "unknown",
        })
        .eq("id", run.id);
      logSessionAiStage({
        event: "session_ai_failed",
        correlationId,
        purpose,
        stage: "artifact",
        errorKind: "unknown",
        dbCode: db.dbCode,
        constraint: db.constraint,
        model: env.GEMINI_MODEL_SESSION,
        durationMs: elapsed(args.started),
      });
      return {
        error: publicMessageForSessionAiError(purpose),
        correlationId,
      };
    }

    await supabase
      .from("ai_runs")
      .update({ status: "succeeded", completed_at: new Date().toISOString() })
      .eq("id", run.id);

    logSessionAiStage({
      event: "session_ai_artifact_persisted",
      correlationId,
      purpose,
      model: env.GEMINI_MODEL_SESSION,
      durationMs: elapsed(args.started),
    });

    return { artifactId: artifact.id, content: validated, correlationId };
  } catch (error) {
    const errorKind = classifySessionAiError(error);
    await supabase
      .from("ai_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: errorKind,
      })
      .eq("id", run.id);

    logSessionAiStage({
      event: "session_ai_failed",
      correlationId,
      purpose,
      stage: "gemini",
      errorKind,
      providerStatus: error instanceof GeminiApiError ? error.status : undefined,
      providerCode: error instanceof GeminiApiError ? error.providerCode : undefined,
      model: env.GEMINI_MODEL_SESSION,
      durationMs: elapsed(args.started),
    });

    return {
      error: publicMessageForSessionAiError(purpose, errorKind),
      correlationId,
    };
  }
}

export async function runSessionLiveAssist(
  sessionId: string,
  clinicianNotes?: string,
): Promise<SessionAiActionResult> {
  return catchSessionAiFailure("session_live", async (trace) => {
    const { organizationId, user } = await requireOrgContext();
    const session = await getClinicalSession(organizationId, sessionId);
    if (!session) {
      return { error: "Sessão não encontrada.", correlationId: trace.correlationId };
    }

    const gate = await authorizeSessionAi(session.patient_id, "session_live");
    if (!gate.allowed) {
      logSessionAiStage({
        event: "session_ai_failed",
        correlationId: trace.correlationId,
        purpose: "session_live",
        stage: "authorize",
        errorKind: "auth",
        durationMs: elapsed(trace.started),
      });
      return { error: gate.message, correlationId: trace.correlationId };
    }
    logSessionAiStage({
      event: "session_ai_authorized",
      correlationId: trace.correlationId,
      purpose: "session_live",
      durationMs: elapsed(trace.started),
    });

    const rate = consumeAiRateLimit(organizationId, user.id);
    if (!rate.allowed) {
      return { error: AI_RATE_LIMIT_MESSAGE, correlationId: trace.correlationId };
    }

    const patient = await getPatient(organizationId, session.patient_id);
    if (!patient) {
      return { error: "Paciente não encontrado.", correlationId: trace.correlationId };
    }

    const segments = await listTranscriptSegments(sessionId);
    const transcriptWindow = selectPersistedTranscriptText(segments);
    if (!transcriptWindow) {
      return { error: "Ainda não há transcrição disponível nesta sessão.", correlationId: trace.correlationId };
    }

    logSessionAiStage({
      event: "session_ai_context_ready",
      correlationId: trace.correlationId,
      purpose: "session_live",
      durationMs: elapsed(trace.started),
    });

    const lowConfidenceCount = segments.filter(
      (segment) => segment.is_final && segment.ambiguity_flags?.lowConfidence,
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
      correlationId: trace.correlationId,
      started: trace.started,
    });
  });
}

export async function runSessionPreparationAssist(
  patientId: string,
): Promise<SessionAiActionResult> {
  return catchSessionAiFailure("session_preparation", async (trace) => {
    const { organizationId, user } = await requireOrgContext();

    const gate = await authorizeSessionAi(patientId, "session_preparation");
    if (!gate.allowed) {
      logSessionAiStage({
        event: "session_ai_failed",
        correlationId: trace.correlationId,
        purpose: "session_preparation",
        stage: "authorize",
        errorKind: "auth",
        durationMs: elapsed(trace.started),
      });
      return { error: gate.message, correlationId: trace.correlationId };
    }
    logSessionAiStage({
      event: "session_ai_authorized",
      correlationId: trace.correlationId,
      purpose: "session_preparation",
      durationMs: elapsed(trace.started),
    });

    const rate = consumeAiRateLimit(organizationId, user.id);
    if (!rate.allowed) {
      return { error: AI_RATE_LIMIT_MESSAGE, correlationId: trace.correlationId };
    }

    const patient = await getPatient(organizationId, patientId);
    if (!patient) {
      return { error: "Paciente não encontrado.", correlationId: trace.correlationId };
    }

    const pastSessions = await listPatientSessions(organizationId, patientId);
    const finalized = pastSessions.filter((session) => session.status === "finalized").slice(0, 3);
    if (finalized.length === 0) {
      return { error: "Não há sessões finalizadas para preparar continuidade.", correlationId: trace.correlationId };
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

    logSessionAiStage({
      event: "session_ai_context_ready",
      correlationId: trace.correlationId,
      purpose: "session_preparation",
      durationMs: elapsed(trace.started),
    });

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
      correlationId: trace.correlationId,
      started: trace.started,
    });
  });
}

export async function runSessionClosingAssist(
  sessionId: string,
  input: { clinicianNotes?: string; interventionsActuallyRecorded?: string } = {},
): Promise<SessionAiActionResult> {
  return catchSessionAiFailure("session_closing", async (trace) => {
    const { organizationId, user } = await requireOrgContext();
    const session = await getClinicalSession(organizationId, sessionId);
    if (!session) {
      return { error: "Sessão não encontrada.", correlationId: trace.correlationId };
    }

    const gate = await authorizeSessionAi(session.patient_id, "session_closing");
    if (!gate.allowed) {
      logSessionAiStage({
        event: "session_ai_failed",
        correlationId: trace.correlationId,
        purpose: "session_closing",
        stage: "authorize",
        errorKind: "auth",
        durationMs: elapsed(trace.started),
      });
      return { error: gate.message, correlationId: trace.correlationId };
    }
    logSessionAiStage({
      event: "session_ai_authorized",
      correlationId: trace.correlationId,
      purpose: "session_closing",
      durationMs: elapsed(trace.started),
    });

    if (!(await getPatient(organizationId, session.patient_id))) {
      return { error: "Paciente não encontrado.", correlationId: trace.correlationId };
    }

    const attachTranscript = shouldAttachTranscriptToClosing(gate.consentState.transcriptionAllowed);
    const segments = attachTranscript ? await listTranscriptSegments(sessionId) : [];
    const finalTranscriptOrSummary = attachTranscript
      ? selectPersistedTranscriptText(segments)
      : "";

    const workingNotes = await getSessionWorkingNotes(sessionId);
    const clinicianNotes = formatWorkingNotesForClosing(workingNotes, input.clinicianNotes);

    if (!hasUsefulClosingContext(finalTranscriptOrSummary, clinicianNotes)) {
      logSessionAiStage({
        event: "session_ai_failed",
        correlationId: trace.correlationId,
        purpose: "session_closing",
        stage: "context",
        errorKind: "empty_context",
        durationMs: elapsed(trace.started),
      });
      return { error: SESSION_AI_EMPTY_CONTEXT_MESSAGE, correlationId: trace.correlationId };
    }

    logSessionAiStage({
      event: "session_ai_context_ready",
      correlationId: trace.correlationId,
      purpose: "session_closing",
      durationMs: elapsed(trace.started),
    });

    const rate = consumeAiRateLimit(organizationId, user.id);
    if (!rate.allowed) {
      return { error: AI_RATE_LIMIT_MESSAGE, correlationId: trace.correlationId };
    }

    const closingInput: SessionClosingInput = {
      organizationId,
      patientRef: closingPatientRef(),
      sessionId,
      finalTranscriptOrSummary,
      clinicianNotes: clinicianNotes || undefined,
      interventionsActuallyRecorded: input.interventionsActuallyRecorded,
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
      validate: (data) => {
        const coerced = coerceSessionClosingOutput(data);
        if (!coerced) {
          throw new Error("invalid_output");
        }
        return coerced;
      },
      consentVersion: gate.consentState.consentVersion,
      correlationId: trace.correlationId,
      started: trace.started,
    });
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
 *
 * The primary clinical UX fills editable fields from the AI draft and
 * requires "Salvar DPEP". This remains available for artifact review flows.
 */
export async function appendClosingArtifactToDpep(
  input: unknown,
): Promise<SessionAiActionResult> {
  return catchSessionAiFailure("session_closing", async () => {
    const { organizationId, role } = await requireOrgContext();
    if (!isClinicalPractitioner(role)) {
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
  });
}

export async function discardAiArtifact(artifactId: string): Promise<SessionAiActionResult> {
  return catchSessionAiFailure("session_closing", async () => {
    const { role } = await requireOrgContext();
    if (!isClinicalPractitioner(role)) {
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
  });
}
