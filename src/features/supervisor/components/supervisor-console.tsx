"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ClinicalSessionRow } from "@/features/sessions/contracts";
import type { SupervisorRunRow } from "@/features/supervisor/queries";
import {
  appendSupervisorArtifact,
  discardSupervisorArtifact,
  runSupervisorAssist,
} from "@/features/supervisor/actions";
import {
  ADDITIONAL_FRAMEWORK_LABELS,
  ADDITIONAL_FRAMEWORK_VALUES,
  PRIMARY_APPROACH_LABELS,
  PRIMARY_APPROACH_VALUES,
  type AdditionalFramework,
  type PrimaryApproach,
} from "@/features/supervisor/contracts";
import type { SupervisorOutput } from "@/lib/ai/validators/supervisor";

export function SupervisorConsole({
  patientId,
  patientDisplayName,
  finalizedSessions,
  pastRuns,
}: {
  patientId: string;
  patientDisplayName: string;
  finalizedSessions: ClinicalSessionRow[];
  pastRuns: SupervisorRunRow[];
}) {
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [supervisionGoal, setSupervisionGoal] = useState("");
  const [clinicalQuestion, setClinicalQuestion] = useState("");
  const [primaryApproach, setPrimaryApproach] = useState<PrimaryApproach>("integrative");
  const [frameworks, setFrameworks] = useState<AdditionalFramework[]>([]);
  const [therapistContext, setTherapistContext] = useState("");
  const [diagnosticReasoning, setDiagnosticReasoning] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ artifactId: string; content: SupervisorOutput } | null>(
    null,
  );
  const [attachTarget, setAttachTarget] = useState<string>("");
  const [attachFields, setAttachFields] = useState({ formulation: true, hypotheses: true });

  const toggleSession = (id: string) => {
    setSelectedSessionIds((prev) =>
      prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id],
    );
  };

  const toggleFramework = (value: AdditionalFramework) => {
    setFrameworks((prev) =>
      prev.includes(value) ? prev.filter((existing) => existing !== value) : [...prev, value],
    );
  };

  const canSubmit =
    selectedSessionIds.length > 0 && supervisionGoal.trim() && clinicalQuestion.trim();

  function submit() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const response = await runSupervisorAssist({
        patientId,
        selectedSessionIds,
        supervisionGoal,
        clinicalQuestion,
        primaryApproach,
        selectedAdditionalFrameworks: frameworks,
        therapistContext,
        diagnosticReasoningRequested: diagnosticReasoning,
      });
      if (response.error || !response.artifactId) {
        setError(response.error ?? "Não foi possível consultar o Supervisor agora.");
        return;
      }
      setResult({
        artifactId: response.artifactId,
        content: response.content as SupervisorOutput,
      });
    });
  }

  const previewData = useMemo(
    () => ({
      paciente: patientDisplayName,
      sessõesSelecionadas: finalizedSessions
        .filter((session) => selectedSessionIds.includes(session.id))
        .map((session) => session.started_at ?? session.created_at),
      objetivoDaSupervisão: supervisionGoal,
      perguntaClínica: clinicalQuestion,
      abordagemPrincipal: PRIMARY_APPROACH_LABELS[primaryApproach],
      lentesAdicionais: frameworks.map((framework) => ADDITIONAL_FRAMEWORK_LABELS[framework]),
      raciocínioDiagnósticoSolicitado: diagnosticReasoning,
    }),
    [
      patientDisplayName,
      finalizedSessions,
      selectedSessionIds,
      supervisionGoal,
      clinicalQuestion,
      primaryApproach,
      frameworks,
      diagnosticReasoning,
    ],
  );

  function attach() {
    if (!result || !attachTarget) return;
    const target = finalizedSessions.find((session) => session.id === attachTarget);
    if (!target) return;
    startTransition(async () => {
      const response = await appendSupervisorArtifact({
        artifactId: result.artifactId,
        targetSessionId: target.id,
        expectedVersion: target.version,
        fields: attachFields,
      });
      if (response.error) {
        setError(response.error);
        return;
      }
      setResult(null);
    });
  }

  function discard() {
    if (!result) return;
    startTransition(async () => {
      await discardSupervisorArtifact(result.artifactId);
      setResult(null);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
      <section className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5">
        <h2 className="font-serif text-lg font-bold italic text-foreground">Configuração</h2>

        <div className="flex flex-col gap-1.5">
          <Label>Sessões selecionadas</Label>
          {finalizedSessions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma sessão finalizada ainda para este paciente.
            </p>
          ) : (
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-2">
              {finalizedSessions.map((session) => (
                <label key={session.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedSessionIds.includes(session.id)}
                    onChange={() => toggleSession(session.id)}
                  />
                  {new Date(session.started_at ?? session.created_at).toLocaleDateString("pt-BR")}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="supervisionGoal">Objetivo da supervisão</Label>
          <textarea
            id="supervisionGoal"
            rows={2}
            className="rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm"
            value={supervisionGoal}
            onChange={(event) => setSupervisionGoal(event.target.value)}
            placeholder="Ex.: preparar próxima sessão, atualizar formulação…"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="clinicalQuestion">Pergunta clínica</Label>
          <textarea
            id="clinicalQuestion"
            rows={3}
            className="rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm"
            value={clinicalQuestion}
            onChange={(event) => setClinicalQuestion(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Abordagem principal</Label>
          <div className="flex flex-col gap-1">
            {PRIMARY_APPROACH_VALUES.map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="primaryApproach"
                  checked={primaryApproach === value}
                  onChange={() => setPrimaryApproach(value)}
                />
                {PRIMARY_APPROACH_LABELS[value]}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Lentes adicionais (somente se selecionadas)</Label>
          <div className="flex flex-col gap-1">
            {ADDITIONAL_FRAMEWORK_VALUES.map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={frameworks.includes(value)}
                  onChange={() => toggleFramework(value)}
                />
                {ADDITIONAL_FRAMEWORK_LABELS[value]}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="therapistContext">Contexto da psicóloga (opcional)</Label>
          <textarea
            id="therapistContext"
            rows={2}
            className="rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm"
            value={therapistContext}
            onChange={(event) => setTherapistContext(event.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={diagnosticReasoning}
            onChange={(event) => setDiagnosticReasoning(event.target.checked)}
          />
          Solicitar raciocínio diagnóstico (sempre hipotético)
        </label>

        <button
          type="button"
          className="flex items-center gap-1.5 text-xs font-semibold text-primary"
          onClick={() => setShowPreview((value) => !value)}
        >
          <ChevronDown className={showPreview ? "size-3.5 rotate-180" : "size-3.5"} aria-hidden />
          Ver dados enviados à IA
        </button>
        {showPreview ? (
          <pre className="max-h-52 overflow-auto rounded-xl bg-surface/60 p-3 text-xs">
            {JSON.stringify(previewData, null, 2)}
          </pre>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed">
            {error}
          </p>
        ) : null}

        <Button type="button" isLoading={isPending} disabled={!canSubmit} onClick={submit}>
          <Sparkles className="size-4" aria-hidden />
          Consultar Supervisor
        </Button>
      </section>

      <section className="flex flex-col gap-6">
        {result ? (
          <SupervisorResult
            content={result.content}
            finalizedSessions={finalizedSessions}
            attachTarget={attachTarget}
            setAttachTarget={setAttachTarget}
            attachFields={attachFields}
            setAttachFields={setAttachFields}
            onAttach={attach}
            onDiscard={discard}
            isPending={isPending}
          />
        ) : (
          <div className="rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Configure a consulta ao lado. O resultado é sempre um rascunho — nada é salvo no
            prontuário sem uma ação explícita.
          </div>
        )}

        <SupervisorHistory runs={pastRuns} />
      </section>
    </div>
  );
}

function SupervisorResult({
  content,
  finalizedSessions,
  attachTarget,
  setAttachTarget,
  attachFields,
  setAttachFields,
  onAttach,
  onDiscard,
  isPending,
}: {
  content: SupervisorOutput;
  finalizedSessions: ClinicalSessionRow[];
  attachTarget: string;
  setAttachTarget: (value: string) => void;
  attachFields: { formulation: boolean; hypotheses: boolean };
  setAttachFields: (value: { formulation: boolean; hypotheses: boolean }) => void;
  onAttach: () => void;
  onDiscard: () => void;
  isPending: boolean;
}) {
  return (
    <div className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-6">
      <div>
        <span className="text-xs font-bold uppercase text-muted-foreground">Resposta direta</span>
        <p className="text-foreground">{content.directAnswer}</p>
      </div>

      <div>
        <span className="text-xs font-bold uppercase text-muted-foreground">Síntese</span>
        <p className="text-foreground">{content.clinicalSynthesis}</p>
      </div>

      {content.hypotheses.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase text-muted-foreground">
            Hipóteses e grau de sustentação
          </span>
          {content.hypotheses.map((hypothesis, index) => (
            <div key={index} className="rounded-xl border border-border bg-surface/40 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">{hypothesis.hypothesis}</span>
                <StatusBadge status="info" label={hypothesis.supportLevel} />
              </div>
              {hypothesis.alternatives.length > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Alternativas: {hypothesis.alternatives.join("; ")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {content.prioritizedInterventions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase text-muted-foreground">
            Intervenções priorizadas
          </span>
          {content.prioritizedInterventions
            .slice()
            .sort((a, b) => a.priority - b.priority)
            .map((intervention, index) => (
              <div key={index} className="rounded-xl border border-border bg-surface/40 p-3 text-sm">
                <span className="font-semibold text-foreground">
                  {intervention.priority}. {intervention.option}
                </span>
                <p className="text-muted-foreground">{intervention.rationale}</p>
              </div>
            ))}
        </div>
      ) : null}

      {content.suggestedQuestions.length > 0 ? (
        <div>
          <span className="text-xs font-bold uppercase text-muted-foreground">
            Perguntas úteis
          </span>
          <ul className="list-disc pl-5 text-sm text-foreground">
            {content.suggestedQuestions.map((question, index) => (
              <li key={index}>{question.question}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {content.nextSessionPlan.length > 0 ? (
        <div>
          <span className="text-xs font-bold uppercase text-muted-foreground">
            Plano de próxima sessão
          </span>
          <ol className="list-decimal pl-5 text-sm text-foreground">
            {content.nextSessionPlan.map((step, index) => (
              <li key={index}>{step.step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {content.competenceAndSupervision.humanSupervisionRecommended ? (
        <p className="rounded-xl border border-attention/30 bg-attention-bg px-4 py-3 text-sm text-attention">
          Considerar supervisão humana/interconsulta: {content.competenceAndSupervision.reasons.join("; ")}
        </p>
      ) : null}

      {content.limitations.length > 0 ? (
        <div>
          <span className="text-xs font-bold uppercase text-muted-foreground">
            Limitações/alertas
          </span>
          <p className="text-sm text-muted-foreground">{content.limitations.join("; ")}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <span className="text-xs font-bold uppercase text-muted-foreground">
          Anexar conteúdo selecionado ao prontuário
        </span>
        <select
          className="rounded-xl border border-border bg-input px-3 py-2 text-sm"
          value={attachTarget}
          onChange={(event) => setAttachTarget(event.target.value)}
        >
          <option value="">Escolha a sessão de destino…</option>
          {finalizedSessions.map((session) => (
            <option key={session.id} value={session.id}>
              {new Date(session.started_at ?? session.created_at).toLocaleDateString("pt-BR")}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={attachFields.formulation}
            onChange={(event) =>
              setAttachFields({ ...attachFields, formulation: event.target.checked })
            }
          />
          Síntese clínica → Formulação
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={attachFields.hypotheses}
            onChange={(event) =>
              setAttachFields({ ...attachFields, hypotheses: event.target.checked })
            }
          />
          Hipóteses → Hipóteses
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDiscard} isLoading={isPending}>
            Descartar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!attachTarget}
            isLoading={isPending}
            onClick={onAttach}
          >
            Anexar à área de trabalho clínico
          </Button>
        </div>
      </div>
    </div>
  );
}

function SupervisorHistory({ runs }: { runs: SupervisorRunRow[] }) {
  if (runs.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 rounded-3xl border border-border bg-card p-5">
      <span className="text-xs font-bold uppercase text-muted-foreground">
        Histórico de supervisões
      </span>
      {runs.map((run) => (
        <div
          key={run.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/40 px-3 py-2 text-sm"
        >
          <span className="text-foreground">
            {new Date(run.created_at).toLocaleString("pt-BR")}
          </span>
          <StatusBadge
            status={run.status === "succeeded" ? "completed" : run.status === "failed" ? "failed" : "pending"}
            label={run.status === "succeeded" ? "Concluída" : run.status === "failed" ? "Falhou" : "Em execução"}
          />
        </div>
      ))}
    </div>
  );
}
