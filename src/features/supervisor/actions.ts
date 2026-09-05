"use server";

import { revalidatePath } from "next/cache";
import { RUNTIME_PROMPTS, RUNTIME_PROMPT_VERSION } from "@/lib/ai/prompts";
import { SUPERVISOR_SCHEMA } from "@/lib/ai/contracts/supervisor";
import { supervisorOutputSchema } from "@/lib/ai/validators/supervisor";
import { toGeminiResponseJsonSchema } from "@/lib/ai/schema-adapter";
import { GeminiClient } from "@/lib/integrations/gemini/client";
import { getServerEnv } from "@/lib/env/server";
import { isClinicalPractitioner } from "@/features/organizations/roles";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPatient } from "@/features/patients/queries";
import {
  getClinicalSession,
  getSessionDpep,
  getSessionWorkingNotes,
} from "@/features/sessions/queries";
import { buildSupervisorContext, type SupervisorInput } from "@/features/supervisor/dto";
import { authorizeSupervisorAi } from "@/features/supervisor/gate";
import {
  appendSupervisorArtifactSchema,
  supervisorFormSchema,
} from "@/features/supervisor/contracts";
import {
  isAiArtifactIsolationError,
  mapAiArtifactAppendError,
} from "@/features/sessions/ai/artifact-integrity";
import { AI_RATE_LIMIT_MESSAGE, consumeAiRateLimit } from "@/lib/security/rate-limit";
import { firstRpcRow } from "@/lib/supabase/rpc-result";

export interface SupervisorActionResult {
  error?: string;
  runId?: string;
  artifactId?: string;
  content?: unknown;
}

export async function runSupervisorAssist(input: unknown): Promise<SupervisorActionResult> {
  const parsed = supervisorFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const values = parsed.data;

  const gate = await authorizeSupervisorAi(values.patientId);
  if (!gate.allowed) {
    return { error: gate.message };
  }
  const { organizationId, userId } = gate;

  const rate = consumeAiRateLimit(organizationId, userId);
  if (!rate.allowed) {
    return { error: AI_RATE_LIMIT_MESSAGE };
  }

  const patient = await getPatient(organizationId, values.patientId);
  if (!patient) {
    return { error: "Paciente não encontrado." };
  }

  const selectedSessions: string[] = [];
  const workingNoteTexts: string[] = [];
  for (const sessionId of values.selectedSessionIds) {
    const session = await getClinicalSession(organizationId, sessionId);
    if (!session || session.patient_id !== values.patientId) {
      return { error: "Sessão selecionada não pertence a este paciente." };
    }
    const dpep = await getSessionDpep(sessionId);
    selectedSessions.push(
      `Sessão de ${session.started_at ?? session.created_at}:\n` +
        `Demanda: ${dpep?.demand ?? "—"}\nProcedimentos: ${dpep?.procedures ?? "—"}\n` +
        `Evolução: ${dpep?.evolution ?? "—"}\nPlano: ${dpep?.plan ?? "—"}`,
    );

    const notes = await getSessionWorkingNotes(sessionId);
    if (notes?.formulation || notes?.hypotheses || notes?.working_observations) {
      workingNoteTexts.push(
        [notes.formulation, notes.hypotheses, notes.working_observations]
          .filter(Boolean)
          .join("\n"),
      );
    }
  }

  const relevantContext = values.relevantContext
    ? values.relevantContext.split(/\n+/).filter(Boolean)
    : undefined;
  const patientGoalsList = values.patientGoals
    ? values.patientGoals.split(/\n+/).filter(Boolean)
    : undefined;
  const patientPreferencesList = values.patientPreferences
    ? values.patientPreferences.split(/\n+/).filter(Boolean)
    : undefined;

  const supervisorInput: SupervisorInput = {
    organizationId,
    patientRef: { displayLabel: patient.preferred_name, ageGroup: values.ageGroup },
    supervisionGoal: values.supervisionGoal,
    clinicalQuestion: values.clinicalQuestion,
    selectedSessions: selectedSessions.join("\n\n"),
    selectedClinicalNotes: workingNoteTexts.length > 0 ? workingNoteTexts.join("\n\n") : undefined,
    treatmentGoals: patientGoalsList,
    patientPreferences: patientPreferencesList,
    therapistContext: values.therapistContext || undefined,
    clinicalContext:
      values.ageGroup || values.modality || relevantContext
        ? {
            ageGroup: values.ageGroup,
            modality: values.modality,
            relevantContext,
            patientGoals: patientGoalsList,
            patientPreferences: patientPreferencesList,
          }
        : undefined,
    primaryApproach: values.primaryApproach,
    selectedAdditionalFrameworks: values.selectedAdditionalFrameworks,
    diagnosticReasoningRequested: values.diagnosticReasoningRequested,
  };

  const supabase = await createSupabaseServerClient();
  const env = getServerEnv();

  const { data: run, error: runError } = await supabase
    .from("ai_runs")
    .insert({
      organization_id: organizationId,
      patient_id: values.patientId,
      purpose: "supervisor",
      provider: "gemini",
      model: env.GEMINI_MODEL_SUPERVISOR,
      prompt_name: "supervisor",
      prompt_version: RUNTIME_PROMPT_VERSION,
      schema_version: RUNTIME_PROMPT_VERSION,
      consent_version: gate.consentState.consentVersion ?? null,
      status: "running",
      source_ids: { selectedSessionIds: values.selectedSessionIds },
    })
    .select("id")
    .single();

  if (runError || !run) {
    return { error: "Não foi possível registrar a execução de IA." };
  }

  try {
    const client = new GeminiClient({ apiKey: env.GEMINI_API_KEY });
    const raw = await client.generateStructured({
      model: env.GEMINI_MODEL_SUPERVISOR,
      systemInstruction: RUNTIME_PROMPTS.supervisor,
      userContent: buildSupervisorContext(supervisorInput),
      responseJsonSchema: toGeminiResponseJsonSchema(SUPERVISOR_SCHEMA),
    });

    const validated = supervisorOutputSchema.parse(raw);

    const { data: artifact, error: artifactError } = await supabase
      .from("ai_artifacts")
      .insert({
        run_id: run.id,
        organization_id: organizationId,
        type: "supervisor",
        structured_content: validated,
      })
      .select("id")
      .single();

    if (artifactError || !artifact) {
      throw new Error("failed to persist supervisor artifact");
    }

    await supabase
      .from("ai_runs")
      .update({ status: "succeeded", completed_at: new Date().toISOString() })
      .eq("id", run.id);

    revalidatePath("/app/supervisor");
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
      error:
        "A IA não retornou um resultado válido agora. Nenhum conteúdo foi salvo (falha fechada).",
    };
  }
}

/**
 * Human-in-the-loop "botão explícito para anexar conteúdo selecionado ao
 * prontuário". A escrita clínica é atômica e validada no banco: tenant,
 * paciente, sessão, tipo do artefato e versão otimista são conferidos juntos.
 */
export async function appendSupervisorArtifact(input: unknown): Promise<SupervisorActionResult> {
  const { organizationId, role } = await requireOrgContext();
  if (!isClinicalPractitioner(role)) {
    return { error: "forbidden_role" };
  }
  const parsed = appendSupervisorArtifactSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "invalid_request" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: saveResult, error: saveError } = await supabase.rpc(
    "append_verified_ai_artifact_to_session",
    {
      p_artifact_id: parsed.data.artifactId,
      p_target_session_id: parsed.data.targetSessionId,
      p_expected_version: parsed.data.expectedVersion,
      p_mode: "supervisor",
      p_include_formulation: parsed.data.fields.formulation,
      p_include_hypotheses: parsed.data.fields.hypotheses,
    },
  );

  if (saveError) {
    if (isAiArtifactIsolationError(saveError.message)) {
      await logAuditEvent({
        organizationId,
        action: "ai_artifact.isolation_rejected",
        resourceType: "ai_artifact",
        resourceId: parsed.data.artifactId,
        metadata: {
          target_session_id: parsed.data.targetSessionId,
          mode: "supervisor",
        },
      });
    }
    return { error: mapAiArtifactAppendError(saveError.message) };
  }

  const row = firstRpcRow<{ new_version: number }>(saveResult);
  if (!row) {
    return { error: "Não foi possível salvar — a sessão pode ter sido alterada. Recarregue." };
  }

  revalidatePath(`/session/${parsed.data.targetSessionId}`);
  return { artifactId: parsed.data.artifactId };
}

export async function discardSupervisorArtifact(
  artifactId: string,
): Promise<SupervisorActionResult> {
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
}
