"use client";

import { Sparkles } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { runSessionLiveAssist } from "@/features/sessions/ai/actions";
import { shortCorrelationCode } from "@/features/sessions/ai/correlation";
import { SESSION_AI_LIVE_USER_ERROR } from "@/features/sessions/ai/messages";
import { sessionLiveOutputSchema, type SessionLiveOutput } from "@/lib/ai/validators/session";

const SAFETY_LABEL: Record<string, { label: string; status: "info" | "attention" | "failed" }> = {
  none: { label: "Sem sinal explícito", status: "info" },
  attention: { label: "Atenção — explorar com a paciente", status: "attention" },
  urgent_review: { label: "Revisão imediata", status: "failed" },
};

export function SessionAiPanel({ sessionId }: { sessionId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [correlationCode, setCorrelationCode] = useState<string | null>(null);
  const [liveResult, setLiveResult] = useState<SessionLiveOutput | null>(null);
  const liveLock = useRef(false);

  function runLive() {
    if (liveLock.current) {
      return;
    }
    liveLock.current = true;
    setError(null);
    setCorrelationCode(null);
    startTransition(async () => {
      try {
        const result = await runSessionLiveAssist(sessionId);
        if (result.error) {
          setError(result.error);
          setCorrelationCode(
            result.correlationId ? shortCorrelationCode(result.correlationId) : null,
          );
          return;
        }
        const parsed = sessionLiveOutputSchema.safeParse(result.content);
        if (!parsed.success) {
          setError(SESSION_AI_LIVE_USER_ERROR);
          setCorrelationCode(
            result.correlationId ? shortCorrelationCode(result.correlationId) : null,
          );
          return;
        }
        setLiveResult(parsed.data);
      } catch {
        setError(SESSION_AI_LIVE_USER_ERROR);
        setCorrelationCode(null);
      } finally {
        liveLock.current = false;
      }
    });
  }

  const safety = liveResult
    ? (SAFETY_LABEL[liveResult.safety.severity] ?? SAFETY_LABEL.none)
    : null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          isLoading={isPending}
          disabled={isPending}
          onClick={runLive}
          className="min-h-11"
        >
          <Sparkles className="size-4" aria-hidden />
          Apoio ao vivo
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
        >
          <p>{error}</p>
          {correlationCode ? (
            <p className="mt-1 font-mono text-[11px] tracking-wide text-failed/60">
              Código: {correlationCode}
            </p>
          ) : null}
        </div>
      ) : null}

      {liveResult && safety ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/40 p-4 text-sm">
          <StatusBadge status={safety.status} label={safety.label} />
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
    </div>
  );
}
