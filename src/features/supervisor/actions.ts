"use server";

import { revalidatePath } from "next/cache";
import { RUNTIME_PROMPTS, RUNTIME_PROMPT_VERSION, RUNTIME_SCHEMA_VERSION } from "@/lib/ai/prompts";
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
import { AI_RATE_LIMIT_MESSAGE, consumeAiRateLimit } from "@/lib/security/rate-limit";

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
      schema_version: RUNTIME_SCHEMA_VERSION,
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
 * prontuário" (prompts/07-supervisor-ai.md): appends the synthesis and/or
 * hypotheses into a chosen session's clinical working notes, through the
 * same optimistic-concurrency path a manual edit would use.
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
  const { data: artifact, error: artifactError } = await supabase
    .from("ai_artifacts")
    .select("id, type, structured_content, review_status, run_id")
    .eq("id", parsed.data.artifactId)
    .maybeSingle();

  if (artifactError || !artifact || artifact.type !== "supervisor") {
    return { error: "Rascunho de supervisão não encontrado." };
  }
  if (artifact.review_status !== "pending") {
    return { error: "Este rascunho já foi revisado." };
  }

  const targetSession = await getClinicalSession(organizationId, parsed.data.targetSessionId);
  if (!targetSession) {
    return { error: "Sessão não encontrada." };
  }

  const { data: run } = await supabase
    .from("ai_runs")
    .select("patient_id, organization_id")
    .eq("id", artifact.run_id)
    .maybeSingle();

  if (
    !run ||
    run.organization_id !== organizationId ||
    (run.patient_id != null && run.patient_id !== targetSession.patient_id)
  ) {
    return { error: "Rascunho de supervisão não encontrado." };
  }

  const content = artifact.structured_content as {
    clinicalSynthesis?: string;
    hypotheses?: { hypothesis: string }[];
  };

  const currentNotes = await getSessionWorkingNotes(parsed.data.targetSessionId);
  const appendedFormulation = parsed.data.fields.formulation
    ? [currentNotes?.formulation, `[Supervisor IA] ${content.clinicalSynthesis ?? ""}`]
        .filter(Boolean)
        .join("\n\n")
    : currentNotes?.formulation ?? null;
  const appendedHypotheses = parsed.data.fields.hypotheses
    ? [
        currentNotes?.hypotheses,
        (content.hypotheses ?? []).map((h) => `[Supervisor IA] ${h.hypothesis}`).join("\n"),
      ]
        .filter(Boolean)
        .join("\n\n")
    : currentNotes?.hypotheses ?? null;

  const { data: saveResult, error: saveError } = await supabase.rpc(
    "save_session_working_notes",
    {
      p_session_id: parsed.data.targetSessionId,
      org_id: organizationId,
      p_expected_version: parsed.data.expectedVersion,
      p_formulation: appendedFormulation,
      p_hypotheses: appendedHypotheses,
      p_working_observations: currentNotes?.working_observations ?? null,
    },
  );

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
    action: "ai_artifact.appended_to_working_notes",
    resourceType: "clinical_session",
    resourceId: parsed.data.targetSessionId,
  });

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
