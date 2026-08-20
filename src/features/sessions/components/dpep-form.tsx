"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { saveDpepAction } from "@/features/sessions/actions";
import { dpepFormSchema, type DpepFormValues, type SessionDpepRow } from "@/features/sessions/contracts";

const FIELDS: Array<{ name: "demand" | "procedures" | "evolution" | "plan"; label: string }> = [
  { name: "demand", label: "Demanda" },
  { name: "procedures", label: "Procedimentos" },
  { name: "evolution", label: "Evolução" },
  { name: "plan", label: "Plano / Encaminhamentos" },
];

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

  const {
    register,
    handleSubmit,
    setError,
    reset,
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

  const onSubmit = handleSubmit((values) => {
    setSuccess(false);
    startTransition(async () => {
      const result = await saveDpepAction(sessionId, { ...values, expectedVersion: version });
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map(({ name, label }) => (
          <div key={name} className="flex flex-col gap-1.5">
            <Label htmlFor={`dpep-${name}`}>{label}</Label>
            <textarea
              id={`dpep-${name}`}
              rows={5}
              disabled={disabled}
              className="rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              {...register(name)}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {isDirty ? "Alterações não salvas." : "Sem alterações pendentes."}
        </span>
        <Button type="submit" isLoading={isPending} disabled={disabled}>
          Salvar DPEP
        </Button>
      </div>
    </form>
  );
}
