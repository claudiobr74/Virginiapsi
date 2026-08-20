"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { KnowledgeResult } from "@/features/knowledge/components/knowledge-result";
import {
  applyToCaseAction,
  askKnowledgeAction,
  compareKnowledgeSourcesAction,
  studyKnowledgeAction,
  synthesizeKnowledgeAction,
} from "@/features/knowledge/actions";
import type { KnowledgeSourceRow } from "@/features/knowledge/contracts";
import type { KnowledgeOutput } from "@/lib/ai/validators/knowledge";

const MODES = [
  { id: "query", label: "Perguntar ao Acervo" },
  { id: "synthesis", label: "Síntese Temática" },
  { id: "compare", label: "Comparar Fontes" },
  { id: "study", label: "Modo Estudo" },
  { id: "apply", label: "Aplicar ao Caso" },
] as const;
type ModeId = (typeof MODES)[number]["id"];

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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KnowledgeOutput | null>(null);

  function toggleSource(id: string) {
    setSelectedSourceIds((prev) =>
      prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id],
    );
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
                : await applyToCaseAction({
                    patientId,
                    collectionIds: selectedCollectionIds,
                    question,
                  });

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
    (mode !== "apply" || Boolean(patientId));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="tablist">
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
            }}
            className={
              mode === item.id
                ? "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                : "rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface"
            }
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
        <select
          className="rounded-xl border border-border bg-input px-3 py-2 text-sm"
          value={patientId}
          onChange={(event) => setPatientId(event.target.value)}
        >
          <option value="">Selecione o paciente…</option>
          {patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.preferred_name}
            </option>
          ))}
        </select>
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
        onChange={(event) => setQuestion(event.target.value)}
      />

      {error ? (
        <p role="alert" className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed">
          {error}
        </p>
      ) : null}

      <Button type="button" isLoading={isPending} disabled={!canSubmit} onClick={submit}>
        Consultar
      </Button>

      {result ? <KnowledgeResult content={result} /> : null}
    </div>
  );
}
