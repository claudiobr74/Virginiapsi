"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  applyToCaseAction,
  askKnowledgeAction,
  compareKnowledgeSourcesAction,
  previewApplyToCaseAction,
  studyKnowledgeAction,
  synthesizeKnowledgeAction,
} from "@/features/knowledge/actions";
import {
  DEFAULT_APPLY_TO_CASE_SELECTION,
  type ApplyToCaseSelection,
} from "@/features/knowledge/apply-to-case-context";
import { KnowledgeResult } from "@/features/knowledge/components/knowledge-result";
import type { KnowledgeSourceRow } from "@/features/knowledge/contracts";
import type { KnowledgeOutput } from "@/lib/ai/validators/knowledge";
import { cn } from "@/lib/utils/cn";

const MODES = [
  { id: "query", label: "Perguntar ao Acervo" },
  { id: "synthesis", label: "Síntese Temática" },
  { id: "compare", label: "Comparar Fontes" },
  { id: "study", label: "Modo Estudo" },
  { id: "apply", label: "Aplicar ao Caso" },
] as const;
type ModeId = (typeof MODES)[number]["id"];

const APPLY_CHECKS: Array<{ key: keyof ApplyToCaseSelection; label: string }> = [
  { key: "formulation", label: "Formulação atual" },
  { key: "therapyGoals", label: "Objetivos terapêuticos" },
  { key: "lastSession", label: "Última sessão" },
  { key: "lastThreeSessions", label: "Últimas 3 sessões" },
  { key: "dpep", label: "DPEP" },
  { key: "additionalNotes", label: "Observações adicionais" },
];

export function KnowledgeModesPanel({
  selectedCollectionIds,
  sources,
  patients,
}: {
  selectedCollectionIds: string[];
  sources: KnowledgeSourceRow[];
  patients: { id: string; preferred_name: string }[];
}) {
  const [mode, setMode] = useState<ModeId>("query");
  const [question, setQuestion] = useState("");
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [studyFormat, setStudyFormat] = useState("resumo_estruturado");
  const [patientId, setPatientId] = useState("");
  const [selection, setSelection] = useState<ApplyToCaseSelection>(DEFAULT_APPLY_TO_CASE_SELECTION);
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KnowledgeOutput | null>(null);

  function toggleSource(id: string) {
    setSelectedSourceIds((prev) =>
      prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id],
    );
  }

  function applyPayload() {
    return {
      patientId,
      collectionIds: selectedCollectionIds,
      question,
      additionalNotes,
      selection,
    };
  }

  function previewApply() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const response = await previewApplyToCaseAction(applyPayload());
      if (response.error) {
        setPreview(null);
        setError(response.error);
        return;
      }
      setPreview(response.preview ?? null);
    });
  }

  function submit() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const response =
        mode === "query"
          ? await askKnowledgeAction({ collectionIds: selectedCollectionIds, question })
          : mode === "synthesis"
            ? await synthesizeKnowledgeAction({ collectionIds: selectedCollectionIds, topic: question })
            : mode === "compare"
              ? await compareKnowledgeSourcesAction({ sourceIds: selectedSourceIds, question })
              : mode === "study"
                ? await studyKnowledgeAction({
                    collectionIds: selectedCollectionIds,
                    topic: question,
                    format: studyFormat as never,
                  })
                : await applyToCaseAction(applyPayload());

      if (response.error || !response.content) {
        setError(response.error ?? "Não foi possível concluir a consulta agora.");
        return;
      }
      setResult(response.content);
    });
  }

  const canSubmit =
    question.trim().length > 0 &&
    (mode !== "compare" || selectedSourceIds.length >= 2) &&
    (mode !== "apply" || Boolean(patientId && preview));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-serif text-lg font-bold italic text-foreground">Consulte o acervo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pergunta teórica por padrão. Aplicar ao Caso é o único modo que usa dados de paciente —
          e só com consentimento válido.
        </p>
      </div>

      <div
        className="-mx-1 flex flex-nowrap gap-1 overflow-x-auto border-b border-border px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
      >
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={mode === item.id}
            onClick={() => {
              setMode(item.id);
              setResult(null);
              setError(null);
              setPreview(null);
            }}
            className={cn(
              "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
              mode === item.id
                ? "border-sage-700 font-semibold text-sage-700"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {mode === "compare" ? (
        <div className="flex flex-col gap-1 rounded-xl border border-border p-3">
          <span className="text-xs font-bold uppercase text-muted-foreground">
            Selecione ao menos duas fontes
          </span>
          {sources.map((source) => (
            <label key={source.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedSourceIds.includes(source.id)}
                onChange={() => toggleSource(source.id)}
              />
              {source.title ?? source.storage_path}
            </label>
          ))}
        </div>
      ) : null}

      {mode === "study" ? (
        <select
          className="rounded-xl border border-border bg-input px-3 py-2 text-sm"
          value={studyFormat}
          onChange={(event) => setStudyFormat(event.target.value)}
        >
          <option value="explicacao_progressiva">Explicação progressiva</option>
          <option value="resumo_estruturado">Resumo estruturado</option>
          <option value="mapa_conceitual">Mapa conceitual</option>
          <option value="quadro_comparativo">Quadro comparativo</option>
          <option value="perguntas_revisao">Perguntas de revisão</option>
          <option value="flashcards">Flashcards</option>
        </select>
      ) : null}

      {mode === "apply" ? (
        <div className="flex flex-col gap-3">
          <select
            className="rounded-xl border border-border bg-input px-3 py-2 text-sm"
            value={patientId}
            onChange={(event) => {
              setPatientId(event.target.value);
              setPreview(null);
            }}
          >
            <option value="">Selecione o paciente…</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.preferred_name}
              </option>
            ))}
          </select>

          <div className="rounded-xl border border-border p-3">
            <span className="text-xs font-bold uppercase text-muted-foreground">
              Contexto que será enviado
            </span>
            <div className="mt-2 flex flex-col gap-1">
              {APPLY_CHECKS.map((item) => (
                <label key={item.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selection[item.key]}
                    onChange={(event) => {
                      setSelection((current) => ({
                        ...current,
                        [item.key]: event.target.checked,
                      }));
                      setPreview(null);
                    }}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>

          {selection.additionalNotes ? (
            <textarea
              rows={2}
              placeholder="Observações adicionais (sem identificadores pessoais)…"
              className="rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm"
              value={additionalNotes}
              onChange={(event) => {
                setAdditionalNotes(event.target.value);
                setPreview(null);
              }}
            />
          ) : null}

          <Button
            type="button"
            variant="secondary"
            disabled={!patientId || question.trim().length === 0}
            isLoading={isPending}
            onClick={previewApply}
          >
            Pré-visualizar contexto
          </Button>

          {preview ? (
            <pre className="whitespace-pre-wrap rounded-xl border border-border bg-surface px-3.5 py-3 text-xs leading-5 text-muted-foreground">
              {preview}
            </pre>
          ) : null}
        </div>
      ) : null}

      <textarea
        rows={3}
        placeholder={
          mode === "query"
            ? "Sua pergunta ao acervo…"
            : mode === "synthesis" || mode === "study"
              ? "Tema…"
              : mode === "compare"
                ? "O que comparar entre as fontes?"
                : "Pergunta clínica para aplicar a literatura ao caso…"
        }
        className="rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm"
        value={question}
        onChange={(event) => {
          setQuestion(event.target.value);
          if (mode === "apply") setPreview(null);
        }}
      />

      {error ? (
        <p role="alert" className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed">
          {error}
        </p>
      ) : null}

      <Button type="button" isLoading={isPending} disabled={!canSubmit} onClick={submit}>
        <Sparkles className="size-4" aria-hidden />
        Consultar
      </Button>

      {result ? <KnowledgeResult content={result} question={question} /> : null}
    </div>
  );
}
