"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  appendClosingArtifactToDpep,
  discardAiArtifact,
  runSessionClosingAssist,
  runSessionLiveAssist,
} from "@/features/sessions/ai/actions";
import type {
  SessionClosingOutput,
  SessionLiveOutput,
} from "@/lib/ai/validators/session";

const SAFETY_LABEL: Record<string, { label: string; status: "info" | "attention" | "failed" }> = {
  none: { label: "Sem sinal explícito no material analisado", status: "info" },
  attention: { label: "Atenção — explorar com a paciente", status: "attention" },
  urgent_review: { label: "Revisão imediata recomendada", status: "failed" },
};

export function SessionAiPanel({
  sessionId,
  version,
  onDpepAppended,
}: {
  sessionId: string;
  version: number;
  onDpepAppended: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [liveResult, setLiveResult] = useState<SessionLiveOutput | null>(null);
  const [closingArtifact, setClosingArtifact] = useState<{
    id: string;
    content: SessionClosingOutput;
  } | null>(null);

  function runLive() {
    setError(null);
    startTransition(async () => {
      const result = await runSessionLiveAssist(sessionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setLiveResult(result.content as SessionLiveOutput);
    });
  }

  function runClosing() {
    setError(null);
    startTransition(async () => {
      const result = await runSessionClosingAssist(sessionId, {});
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.artifactId) {
        setClosingArtifact({ id: result.artifactId, content: result.content as SessionClosingOutput });
      }
    });
  }

  function appendToDpep() {
    if (!closingArtifact) return;
    startTransition(async () => {
      const result = await appendClosingArtifactToDpep({
        artifactId: closingArtifact.id,
        sessionId,
        expectedVersion: version,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setClosingArtifact(null);
      onDpepAppended();
    });
  }

  function discard() {
    if (!closingArtifact) return;
    startTransition(async () => {
      await discardAiArtifact(closingArtifact.id);
      setClosingArtifact(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Apoio silencioso e opcional. A IA não conduz a sessão, não fala com a pessoa atendida e
        nenhum resultado é salvo no prontuário sem sua revisão explícita.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" isLoading={isPending} onClick={runLive}>
          <Sparkles className="size-4" aria-hidden />
          Apoio ao vivo
        </Button>
        <Button type="button" variant="secondary" size="sm" isLoading={isPending} onClick={runClosing}>
          <Sparkles className="size-4" aria-hidden />
          Rascunho de encerramento (DPEP)
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed">
          {error}
        </p>
      ) : null}

      {liveResult ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/40 p-4 text-sm">
          <StatusBadge
            status={SAFETY_LABEL[liveResult.safety.severity].status}
            label={SAFETY_LABEL[liveResult.safety.severity].label}
          />
          <p className="text-foreground">{liveResult.summarySoFar}</p>
          {liveResult.suggestedQuestions.length > 0 ? (
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground">
                Perguntas possíveis
              </p>
              <ul className="list-disc pl-5">
                {liveResult.suggestedQuestions.map((question, index) => (
                  <li key={index}>{question.question}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {liveResult.uncertainties.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Incertezas: {liveResult.uncertainties.join("; ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {closingArtifact ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/40 p-4 text-sm">
          <span className="text-xs font-bold uppercase text-muted-foreground">
            Rascunho — revise antes de salvar
          </span>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Demanda" value={closingArtifact.content.dpepDraft.demanda} />
            <Field label="Procedimentos" value={closingArtifact.content.dpepDraft.procedimentos} />
            <Field label="Evolução" value={closingArtifact.content.dpepDraft.evolucao} />
            <Field label="Plano" value={closingArtifact.content.dpepDraft.plano} />
          </dl>
          {closingArtifact.content.itemsRequiringClinicianConfirmation.length > 0 ? (
            <p className="text-xs text-attention">
              A confirmar: {closingArtifact.content.itemsRequiringClinicianConfirmation.join("; ")}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={discard} isLoading={isPending}>
              Descartar
            </Button>
            <Button type="button" size="sm" onClick={appendToDpep} isLoading={isPending}>
              Usar no DPEP
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value || "—"}</dd>
    </div>
  );
}
