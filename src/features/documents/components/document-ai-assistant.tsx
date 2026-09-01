"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { DOCUMENT_AI_COMMANDS, type DocumentAiCommand } from "@/features/documents/contracts";
import {
  DOCUMENT_AI_INTENTS,
  intentCommand,
  intentNeedsNotes,
  type DocumentAiIntentId,
} from "@/features/documents/studio-presentation";
import {
  generateDocumentAiDraftAction,
  previewDocumentAiContextAction,
} from "@/features/documents/studio-actions";

export function DocumentAiAssistant({
  open,
  onOpenChange,
  documentId,
  patientId,
  interviewPrompts,
  onInsert,
  onError,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  patientId: string | null;
  interviewPrompts: string[];
  onInsert: (draft: string) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [intent, setIntent] = useState<DocumentAiIntentId>("first_draft");
  const [chartOpen, setChartOpen] = useState(false);
  const [chartImport, setChartImport] = useState({
    formulation: false,
    therapyGoals: false,
    lastSession: false,
    lastThreeSessions: false,
    dpep: false,
  });
  const [notes, setNotes] = useState("");
  const [packedPreview, setPackedPreview] = useState("");
  const [contextAck, setContextAck] = useState(false);
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  const [aiReviewNotes, setAiReviewNotes] = useState<string[]>([]);
  const [otherCommand, setOtherCommand] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  function payload() {
    const importing = Object.values(chartImport).some(Boolean);
    const command =
      intent === "other"
        ? otherCommand
          ? (otherCommand as DocumentAiCommand)
          : undefined
        : intentCommand(intent);
    return {
      documentId,
      command,
      answers: notes ? { notas: notes } : undefined,
      selectedContext: importing ? { ...chartImport, additionalNotes: false } : undefined,
    };
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        title="Ajudar a escrever"
        description="O que você gostaria de fazer?"
        tone="documents"
        className="sm:max-w-lg"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {DOCUMENT_AI_INTENTS.map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"
              >
                <input
                  type="radio"
                  name="ai-intent"
                  checked={intent === item.id}
                  onChange={() => setIntent(item.id)}
                />
                {item.label}
              </label>
            ))}
          </div>

          {intentNeedsNotes(intent) ? (
            <>
              <label className="flex flex-col gap-1 text-xs">
                Comando
                <select
                  className="rounded-lg border border-border bg-input px-2 py-1.5"
                  value={otherCommand}
                  onChange={(event) => setOtherCommand(event.target.value)}
                >
                  <option value="">Usar as notas abaixo</option>
                  {DOCUMENT_AI_COMMANDS.map((command) => (
                    <option key={command} value={command}>
                      {command}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                rows={4}
                className="w-full rounded-lg border border-border bg-input px-2 py-1.5 text-sm"
                placeholder="Descreva o ajuste. A instrução passa pelo mesmo fluxo seguro da IA."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </>
          ) : (
            <textarea
              rows={3}
              className="w-full rounded-lg border border-border bg-input px-2 py-1.5 text-sm"
              placeholder="Notas opcionais para a IA"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          )}

          {interviewPrompts.length > 0 ? (
            <ul className="list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
              {interviewPrompts.map((prompt) => (
                <li key={prompt}>{prompt}</li>
              ))}
            </ul>
          ) : null}

          {patientId ? (
            <div>
              <button
                type="button"
                className="text-sm font-semibold text-primary"
                aria-expanded={chartOpen}
                onClick={() => setChartOpen((current) => !current)}
              >
                Usar informações do prontuário
              </button>
              {chartOpen ? (
                <fieldset className="mt-2 space-y-1 text-[11px]">
                  <legend className="sr-only">Importar do prontuário</legend>
                  {(
                    [
                      ["formulation", "Formulação"],
                      ["therapyGoals", "Objetivos"],
                      ["lastSession", "Última sessão / evolução"],
                      ["lastThreeSessions", "Últimas sessões"],
                      ["dpep", "Procedimentos / DPEP"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={chartImport[key]}
                        onChange={(event) =>
                          setChartImport((current) => ({ ...current, [key]: event.target.checked }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
              ) : null}
            </div>
          ) : null}

          <p className="text-[11px] font-semibold text-muted-foreground">Dados que serão utilizados</p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-2 text-[10px] text-muted-foreground">
            {packedPreview ||
              "Atualize a prévia para ver exatamente o envelope enviado à IA (finalidade, texto atual, notas e fatias selecionadas do prontuário)."}
          </pre>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await previewDocumentAiContextAction(payload());
                if (result.error) {
                  onError(result.error);
                  return;
                }
                setPackedPreview(result.preview ?? "");
                setContextAck(false);
              })
            }
          >
            Atualizar prévia do contexto
          </Button>
          <label className="flex items-start gap-2 text-[11px]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={contextAck}
              onChange={(event) => setContextAck(event.target.checked)}
            />
            Confirmo os dados acima como o único contexto enviado à IA.
          </label>
          <Button
            type="button"
            size="sm"
            isLoading={isPending}
            disabled={!contextAck}
            onClick={() =>
              startTransition(async () => {
                const body = payload();
                const preview = await previewDocumentAiContextAction(body);
                if (preview.error || !preview.previewHash) {
                  onError(preview.error ?? "Não foi possível montar a prévia do contexto.");
                  return;
                }
                setPackedPreview(preview.preview ?? "");
                const result = await generateDocumentAiDraftAction({
                  ...body,
                  contextPreviewAcknowledged: true as const,
                  previewHash: preview.previewHash,
                });
                if (result.error) {
                  onError(result.error);
                  return;
                }
                setAiDraft(result.draft ?? null);
                setAiReviewNotes(result.reviewNotes ?? []);
                onSuccess(
                  result.model
                    ? `Rascunho gerado (${result.model}). Revise antes de incorporar.`
                    : "Rascunho gerado. Revise antes de incorporar.",
                );
              })
            }
          >
            Gerar rascunho
          </Button>
          {aiDraft ? (
            <div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-2 text-[11px]">
                {aiDraft}
              </pre>
              {aiReviewNotes.length > 0 ? (
                <ul className="mt-2 list-disc pl-4 text-[11px] text-muted-foreground">
                  {aiReviewNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={() => {
                  onInsert(aiDraft);
                  setAiDraft(null);
                  onOpenChange(false);
                }}
              >
                Inserir na última seção (ainda é rascunho)
              </Button>
            </div>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
