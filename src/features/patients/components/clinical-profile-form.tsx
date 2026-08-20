"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateClinicalProfileAction } from "@/features/patients/actions";
import {
  clinicalProfileFormSchema,
  type ClinicalProfileFormValues,
  type PatientClinicalProfile,
} from "@/features/patients/contracts";

const FIELDS: Array<{
  name: keyof ClinicalProfileFormValues;
  label: string;
  rows?: number;
}> = [
  { name: "chiefComplaint", label: "Queixa principal" },
  { name: "history", label: "Histórico", rows: 4 },
  { name: "therapyGoals", label: "Objetivos terapêuticos" },
  { name: "schemas", label: "Esquemas" },
  { name: "coreBeliefs", label: "Crenças centrais" },
  { name: "generalClinicalNotes", label: "Notas clínicas gerais", rows: 4 },
];

function defaultValues(
  profile: PatientClinicalProfile | null,
): ClinicalProfileFormValues {
  return {
    chiefComplaint: profile?.chief_complaint ?? "",
    history: profile?.history ?? "",
    therapyGoals: profile?.therapy_goals ?? "",
    schemas: profile?.schemas ?? "",
    coreBeliefs: profile?.core_beliefs ?? "",
    generalClinicalNotes: profile?.general_clinical_notes ?? "",
  };
}

export function ClinicalProfileForm({
  patientId,
  profile,
}: {
  patientId: string;
  profile: PatientClinicalProfile | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ClinicalProfileFormValues>({
    resolver: zodResolver(clinicalProfileFormSchema),
    defaultValues: defaultValues(profile),
  });

  const onSubmit = handleSubmit((values) => {
    setSuccess(false);
    startTransition(async () => {
      const result = await updateClinicalProfileAction(patientId, values);
      if (result.error) {
        setError("root", { message: result.error });
        return;
      }
      setSuccess(true);
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
          Acompanhamento clínico salvo.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map(({ name, label, rows = 3 }) => (
          <div
            key={name}
            className={rows > 3 ? "flex flex-col gap-1.5 sm:col-span-2" : "flex flex-col gap-1.5"}
          >
            <Label htmlFor={name}>{label}</Label>
            <textarea
              id={name}
              rows={rows}
              className="rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register(name)}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button type="submit" isLoading={isPending}>
          Salvar acompanhamento
        </Button>
      </div>
    </form>
  );
}
