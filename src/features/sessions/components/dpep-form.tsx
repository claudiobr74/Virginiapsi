"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal, ModalContent } from "@/components/ui/modal";
import { saveDpepAction } from "@/features/sessions/actions";
import { runSessionClosingAssist } from "@/features/sessions/ai/actions";
import { shortCorrelationCode } from "@/features/sessions/ai/correlation";
import {
  extractDpepDraft,
  shouldConfirmDpepReplace,
  type DpepDraftFields,
} from "@/features/sessions/ai/dpep-draft";
import {
  SESSION_AI_DRAFT_BANNER,
  SESSION_AI_MANUAL_HINT,
  SESSION_AI_REPLACE_DESCRIPTION,
  SESSION_AI_REPLACE_TITLE,
  SESSION_AI_USER_ERROR,
} from "@/features/sessions/ai/messages";
import { dpepFormSchema, type DpepFormValues, type SessionDpepRow } from "@/features/sessions/contracts";

const FIELDS: Array<{
  name: "demand" | "procedures" | "evolution" | "plan";
  label: string;
}> = [
  { name: "demand", label: "Demanda" },
  { name: "procedures", label: "Procedimentos" },
  { name: "evolution", label: "Evolução" },
  { name: "plan", label: "Plano / Encaminhamentos" },
];

type AiPhase = "idle" | "generating" | "success" | "error";

function fieldsFromForm(values: DpepFormValues): DpepDraftFields {
  return {
    demand: values.demand ?? "",
    procedures: values.procedures ?? "",
    evolution: values.evolution ?? "",
    plan: values.plan ?? "",
  };
}

export function DpepForm({
  sessionId,
  dpep,
  version,
  onSaved,
  disabled,
}: {
  sessionId: string;
  dpep: SessionDpepRow | null;
  version: number;
  onSaved: () => void;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [aiPhase, setAiPhase] = useState<AiPhase>("idle");
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiCorrelationCode, setAiCorrelationCode] = useState<string | null>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const generatingLock = useRef(false);
  const pendingDraft = useRef<DpepDraftFields | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    getValues,
    setValue,
    formState: { errors, isDirty },
  } = useForm<DpepFormValues>({
    resolver: zodResolver(dpepFormSchema),
    defaultValues: {
      expectedVersion: version,
      demand: dpep?.demand ?? "",
      procedures: dpep?.procedures ?? "",
      evolution: dpep?.evolution ?? "",
      plan: dpep?.plan ?? "",
    },
  });

  useEffect(() => {
    reset({
      expectedVersion: version,
      demand: dpep?.demand ?? "",
      procedures: dpep?.procedures ?? "",
      evolution: dpep?.evolution ?? "",
      plan: dpep?.plan ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só re-sincroniza quando a versão do servidor muda
  }, [version]);

  function applyDraft(draft: DpepDraftFields) {
    setValue("demand", draft.demand, { shouldDirty: true });
    setValue("procedures", draft.procedures, { shouldDirty: true });
    setValue("evolution", draft.evolution, { shouldDirty: true });
    setValue("plan", draft.plan, { shouldDirty: true });
    pendingDraft.current = null;
    setReplaceOpen(false);
    setAiPhase("success");
    setAiError(null);
    setAiCorrelationCode(null);
  }

  async function generateDraft() {
    if (generatingLock.current || disabled) {
      return;
    }
    generatingLock.current = true;
    setAiPhase("generating");
    setAiError(null);
    setAiCorrelationCode(null);
    setSuccess(false);

    try {
      const result = await runSessionClosingAssist(sessionId, {});
      if (result.error) {
        setAiPhase("error");
        setAiError(result.error);
        setAiCorrelationCode(
          result.correlationId ? shortCorrelationCode(result.correlationId) : null,
        );
        return;
      }
      const draft = extractDpepDraft(result.content);
      if (!draft) {
        setAiPhase("error");
        setAiError(SESSION_AI_USER_ERROR);
        setAiCorrelationCode(
          result.correlationId ? shortCorrelationCode(result.correlationId) : null,
        );
        return;
      }
      const current = fieldsFromForm(getValues());
      if (shouldConfirmDpepReplace(current)) {
        pendingDraft.current = draft;
        setReplaceOpen(true);
        setAiPhase("idle");
        return;
      }
      applyDraft(draft);
    } catch {
      setAiPhase("error");
      setAiError(SESSION_AI_USER_ERROR);
      setAiCorrelationCode(null);
    } finally {
      generatingLock.current = false;
    }
  }

  const onSubmit = handleSubmit((values) => {
    setSuccess(false);
    startTransition(async () => {
      try {
        const result = await saveDpepAction(sessionId, { ...values, expectedVersion: version });
        if (result.error) {
          setError("root", { message: result.error });
          return;
        }
        setSuccess(true);
        setAiPhase("idle");
        onSaved();
      } catch {
        setError("root", { message: "Não foi possível salvar o DPEP agora." });
      }
    });
  });

  const generating = aiPhase === "generating";

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-w-0 flex-col gap-4">
      {errors.root ? (
        <p
          role="alert"
          className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
        >
          {errors.root.message}
        </p>
      ) : null}
      {success ? (
        <p
          role="status"
          className="rounded-xl border border-success/30 bg-success-bg px-4 py-3 text-sm text-success"
        >
          DPEP salvo.
        </p>
      ) : null}
      {aiPhase === "success" ? (
        <p
          role="status"
          className="rounded-xl border border-border bg-sage-light/40 px-4 py-3 text-sm text-foreground"
        >
          {SESSION_AI_DRAFT_BANNER}
        </p>
      ) : null}
      {aiPhase === "error" && aiError ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
        >
          <p>{aiError}</p>
          {aiCorrelationCode ? (
            <p className="font-mono text-[11px] tracking-wide text-failed/60">
              Código: {aiCorrelationCode}
            </p>
          ) : null}
          <p className="text-failed/80">{SESSION_AI_MANUAL_HINT}</p>
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void generateDraft()}
              disabled={disabled || generating}
            >
              Tentar novamente
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map(({ name, label }) => (
          <div key={name} className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`dpep-${name}`}>{label}</Label>
            <textarea
              id={`dpep-${name}`}
              rows={5}
              disabled={disabled}
              className="w-full min-w-0 max-w-full rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              {...register(name)}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="min-h-4 text-xs text-muted-foreground">
          {isDirty ? "Alterações não salvas." : ""}
        </span>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          {!disabled ? (
            <Button
              type="button"
              variant="secondary"
              isLoading={generating}
              disabled={generating}
              onClick={() => void generateDraft()}
              className="min-h-11 w-full sm:w-auto"
            >
            {generating ? "Gerando rascunho…" : (
              <>
                <Sparkles className="size-4" aria-hidden />
                Gerar rascunho com IA
              </>
            )}
            </Button>
          ) : null}
          <Button type="submit" isLoading={isPending} disabled={disabled} className="min-h-11 w-full sm:w-auto">
            Salvar DPEP
          </Button>
        </div>
      </div>

      <Modal
        open={replaceOpen}
        onOpenChange={(open) => {
          setReplaceOpen(open);
          if (!open) {
            pendingDraft.current = null;
          }
        }}
      >
        <ModalContent
          title={SESSION_AI_REPLACE_TITLE}
          description={SESSION_AI_REPLACE_DESCRIPTION}
          size="sm"
          footer={
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  pendingDraft.current = null;
                  setReplaceOpen(false);
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const draft = pendingDraft.current;
                  if (draft) {
                    applyDraft(draft);
                  }
                }}
              >
                Substituir pelo rascunho
              </Button>
            </>
          }
        >
          <p>Só entra no prontuário ao salvar o DPEP.</p>
        </ModalContent>
      </Modal>
    </form>
  );
}
