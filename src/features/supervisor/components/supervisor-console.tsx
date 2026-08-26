"use client";

import { BookOpen, CalendarCheck, ChevronDown, HelpCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { PatientAvatar } from "@/features/patients/components/patient-avatar";
import { MODALITY_LABELS, type ConsultationModality } from "@/features/patients/contracts";
import type { ClinicalSessionRow } from "@/features/sessions/contracts";
import {
  appendSupervisorArtifact,
  discardSupervisorArtifact,
  runSupervisorAssist,
} from "@/features/supervisor/actions";
import { SupervisorStepper } from "@/features/supervisor/components/supervisor-stepper";
import {
  ADDITIONAL_FRAMEWORK_LABELS,
  ADDITIONAL_FRAMEWORK_VALUES,
  PRIMARY_APPROACH_LABELS,
  PRIMARY_APPROACH_VALUES,
  type AdditionalFramework,
  type PrimaryApproach,
} from "@/features/supervisor/contracts";
import type { SupervisorRunRow } from "@/features/supervisor/queries";
import type { SupervisorOutput } from "@/lib/ai/validators/supervisor";
import { cn } from "@/lib/utils/cn";

const GOAL_PRESETS = [
  {
    value: "Preparar próxima sessão",
    title: "Preparar Próxima Sessão",
    description: "Sugestões para o próximo encontro a partir das sessões selecionadas",
    icon: CalendarCheck,
  },
  {
    value: "Dúvida clínica",
    title: "Discutir Dúvida Clínica",
    description: "Explorar uma questão técnica, um impasse ou o andamento do caso",
    icon: HelpCircle,
  },
  {
    value: "Atualizar formulação",
    title: "Rever Formulação Clínica",
    description: "Reavaliar hipóteses, plano terapêutico e o que ainda é incerto",
    icon: BookOpen,
  },
] as const;

export function SupervisorConsole({
  patientId,
  patientDisplayName,
  patientPublicCode,
  patientModality,
  finalizedSessions,
  pastRuns,
}: {
  patientId: string;
  patientDisplayName: string;
  patientPublicCode: string;
  patientModality: ConsultationModality;
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
    <div className="flex flex-col gap-6">
      <SupervisorStepper current={result ? 3 : 2} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(18rem,380px)_1fr]">
        <section className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-serif text-lg font-bold italic text-foreground">Configuração</h2>

          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-sage-light/15 px-3 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <PatientAvatar name={patientDisplayName} size="sm" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{patientDisplayName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {MODALITY_LABELS[patientModality]}
                  <span className="mx-1.5">·</span>
                  <span className="font-mono">{patientPublicCode}</span>
                </p>
              </div>
            </div>
            <Link
              href="/app/supervisor"
              className="shrink-0 text-xs font-semibold text-primary hover:text-primary-hover"
            >
              Trocar
            </Link>
          </div>

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

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Objetivo sugerido
            </p>
            <div className="flex flex-col gap-2">
              {GOAL_PRESETS.map((preset) => {
                const selected = supervisionGoal === preset.value;
                const Icon = preset.icon;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setSupervisionGoal(preset.value)}
                    className={cn(
                      "flex items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-colors",
                      selected
                        ? "border-primary bg-sage-light/25"
                        : "border-border bg-card hover:bg-surface/50",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
                        selected ? "bg-primary text-primary-foreground" : "bg-surface text-primary",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">
                        {preset.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                        {preset.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
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
            <div className="flex flex-col gap-2">
              {PRIMARY_APPROACH_VALUES.map((value) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm",
                    primaryApproach === value
                      ? "border-primary bg-sage-light/25 font-semibold"
                      : "border-border bg-card",
                  )}
                >
                  <input
                    type="radio"
                    name="primaryApproach"
                    className="accent-primary"
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
          <p className="text-[11px] leading-4 text-muted-foreground">
            Nenhum resultado entra no prontuário sem revisão explícita. O envio depende do
            consentimento de apoio de IA deste paciente.
          </p>
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
            <div className="rounded-3xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
              Configure a consulta ao lado. O resultado é sempre um rascunho — nada é salvo no
              prontuário sem uma ação explícita.
            </div>
          )}

          <SupervisorHistory runs={pastRuns} />
        </section>
      </div>
    </div>
  );
}

function ResultBlock({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-2xl bg-primary text-xs font-bold text-primary-foreground">
          {n}
        </span>
        <h3 className="font-serif text-lg font-semibold italic text-foreground">{title}</h3>
      </div>
      {children}
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
  const riskAlerts = content.riskAndEthics.filter(
    (item) => item.severity === "attention" || item.severity === "urgent_review",
  );

  return (
    <div className="flex flex-col gap-4">
      <ResultBlock n={1} title="Resposta direta">
        <p className="text-sm text-foreground">{content.directAnswer}</p>
      </ResultBlock>

      <ResultBlock n={2} title="Síntese">
        <p className="text-sm text-foreground">{content.clinicalSynthesis}</p>
      </ResultBlock>

      {content.hypotheses.length > 0 ? (
        <ResultBlock n={3} title="Hipóteses e grau de sustentação">
          <div className="flex flex-col gap-2">
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
        </ResultBlock>
      ) : null}

      {content.prioritizedInterventions.length > 0 ? (
        <ResultBlock n={4} title="Intervenções priorizadas">
          <div className="flex flex-col gap-2">
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
        </ResultBlock>
      ) : null}

      {content.suggestedQuestions.length > 0 ? (
        <ResultBlock n={5} title="Perguntas úteis">
          <ul className="list-disc pl-5 text-sm text-foreground">
            {content.suggestedQuestions.map((question, index) => (
              <li key={index}>{question.question}</li>
            ))}
          </ul>
        </ResultBlock>
      ) : null}

      {content.nextSessionPlan.length > 0 ? (
        <ResultBlock n={6} title="Plano de próxima sessão">
          <ol className="list-decimal pl-5 text-sm text-foreground">
            {content.nextSessionPlan.map((step, index) => (
              <li key={index}>{step.step}</li>
            ))}
          </ol>
        </ResultBlock>
      ) : null}

      {riskAlerts.map((item, index) => (
        <p
          key={`${item.issue}-${index}`}
          className="rounded-xl border border-attention/30 bg-attention-bg px-4 py-3 text-sm text-attention"
        >
          <span className="font-bold">Atenção clínica: </span>
          {item.issue}
        </p>
      ))}

      {content.competenceAndSupervision.humanSupervisionRecommended ? (
        <p className="rounded-xl border border-attention/30 bg-attention-bg px-4 py-3 text-sm text-attention">
          Considerar supervisão humana/interconsulta:{" "}
          {content.competenceAndSupervision.reasons.join("; ")}
        </p>
      ) : null}

      {content.limitations.length > 0 ? (
        <div className="rounded-3xl border border-border bg-card p-5 text-sm shadow-sm">
          <span className="text-xs font-bold uppercase text-muted-foreground">
            Limitações/alertas
          </span>
          <p className="mt-2 text-muted-foreground">{content.limitations.join("; ")}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 rounded-3xl border border-border bg-card p-5 shadow-sm">
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
    <div className="flex flex-col gap-3">
      <h3 className="font-serif text-lg font-semibold italic text-foreground">
        Histórico de Supervisões
      </h3>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {runs.map((run) => (
          <div
            key={run.id}
            className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 text-sm last:border-b-0"
          >
            <span className="font-mono text-xs text-primary">
              {new Date(run.created_at).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <StatusBadge
              status={
                run.status === "succeeded" ? "completed" : run.status === "failed" ? "failed" : "pending"
              }
              label={
                run.status === "succeeded"
                  ? "Concluída"
                  : run.status === "failed"
                    ? "Falhou"
                    : "Em execução"
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
