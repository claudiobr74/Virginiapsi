"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { saveWorkingNotesAction } from "@/features/sessions/actions";
import {
  workingNotesFormSchema,
  type SessionWorkingNotesRow,
  type WorkingNotesFormValues,
} from "@/features/sessions/contracts";

const FIELDS: Array<{
  name: "formulation" | "hypotheses" | "workingObservations";
  label: string;
}> = [
  { name: "formulation", label: "Formulação" },
  { name: "hypotheses", label: "Hipóteses" },
  { name: "workingObservations", label: "Observações de Trabalho" },
];

export function WorkingNotesForm({
  sessionId,
  notes,
  version,
  onSaved,
  disabled,
}: {
  sessionId: string;
  notes: SessionWorkingNotesRow | null;
  version: number;
  onSaved: () => void;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<WorkingNotesFormValues>({
    resolver: zodResolver(workingNotesFormSchema),
    defaultValues: {
      expectedVersion: version,
      formulation: notes?.formulation ?? "",
      hypotheses: notes?.hypotheses ?? "",
      workingObservations: notes?.working_observations ?? "",
    },
  });

  useEffect(() => {
    reset({
      expectedVersion: version,
      formulation: notes?.formulation ?? "",
      hypotheses: notes?.hypotheses ?? "",
      workingObservations: notes?.working_observations ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só re-sincroniza quando a versão do servidor muda
  }, [version]);

  const onSubmit = handleSubmit((values) => {
    setSuccess(false);
    startTransition(async () => {
      const result = await saveWorkingNotesAction(sessionId, {
        ...values,
        expectedVersion: version,
      });
      if (result.error) {
        setError("root", { message: result.error });
        return;
      }
      setSuccess(true);
      onSaved();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">Não visível à secretaria.</p>

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
          Área clínica salva.
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {FIELDS.map(({ name, label }) => (
          <div key={name} className="flex flex-col gap-1.5">
            <Label htmlFor={`working-notes-${name}`}>{label}</Label>
            <textarea
              id={`working-notes-${name}`}
              rows={3}
              disabled={disabled}
              className="rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              {...register(name)}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="min-h-4 text-xs text-muted-foreground">
          {isDirty ? "Alterações não salvas." : ""}
        </span>
        <Button type="submit" variant="secondary" isLoading={isPending} disabled={disabled}>
          Salvar área clínica
        </Button>
      </div>
    </form>
  );
}
