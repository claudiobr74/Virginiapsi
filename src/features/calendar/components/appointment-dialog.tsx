"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createAppointmentAction,
  rescheduleAppointmentAction,
} from "@/features/calendar/appointment-actions";
import {
  APPOINTMENT_MODALITY_VALUES,
  appointmentFormSchema,
  type AppointmentFormValues,
  type AppointmentRow,
} from "@/features/calendar/contracts";
import { MODALITY_LABELS } from "@/features/patients/contracts";
import type { PatientRow } from "@/features/patients/contracts";

export interface AppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patients: Pick<PatientRow, "id" | "preferred_name" | "public_code">[];
  defaultDate: string;
  appointment?: AppointmentRow;
  onSaved: () => void;
}

function defaultValues(
  defaultDate: string,
  appointment?: AppointmentRow,
): AppointmentFormValues {
  if (!appointment) {
    return {
      patientId: "",
      date: defaultDate,
      startTime: "09:00",
      durationMinutes: "50",
      modality: "in_person",
      createMeet: false,
    };
  }

  const starts = new Date(appointment.starts_at);
  const ends = new Date(appointment.ends_at);
  const durationMinutes = Math.round((ends.getTime() - starts.getTime()) / 60_000);

  return {
    patientId: appointment.patient_id ?? "",
    date: appointment.starts_at.slice(0, 10),
    startTime: appointment.starts_at.slice(11, 16),
    durationMinutes: String(durationMinutes),
    modality: appointment.modality,
    createMeet: false,
  };
}

export function AppointmentDialog({
  open,
  onOpenChange,
  patients,
  defaultDate,
  appointment,
  onSaved,
}: AppointmentDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [conflict, setConflict] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentFormSchema),
    values: defaultValues(defaultDate, appointment),
  });

  function submit(values: AppointmentFormValues, force: boolean) {
    startTransition(async () => {
      const result = appointment
        ? await rescheduleAppointmentAction(appointment.id, values, { force })
        : await createAppointmentAction(values, { force });

      if (result.conflict) {
        setConflict(true);
        return;
      }
      if (result.error) {
        setError("root", { message: result.error });
        return;
      }

      setConflict(false);
      reset();
      onSaved();
      onOpenChange(false);
    });
  }

  const onSubmit = handleSubmit((values) => submit(values, false));

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        title={appointment ? "Remarcar consulta" : "Nova consulta"}
        description="Nome Sobrenome • PAC-### aparece automaticamente na agenda."
      >
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.root ? (
            <p
              role="alert"
              className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
            >
              {errors.root.message}
            </p>
          ) : null}

          {conflict ? (
            <div className="flex flex-col gap-2 rounded-xl border border-attention/30 bg-attention-bg px-4 py-3 text-sm text-attention">
              <p>Já existe uma sessão agendada nesse horário.</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                isLoading={isPending}
                onClick={handleSubmit((values) => submit(values, true))}
              >
                Agendar mesmo assim
              </Button>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="patientId">Paciente (opcional)</Label>
            <select
              id="patientId"
              className="h-11 rounded-xl border border-border bg-input px-3.5 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register("patientId")}
            >
              <option value="">Sem paciente vinculado</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.preferred_name} • {patient.public_code}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="date">Data</Label>
              <Input id="date" type="date" {...register("date")} />
              {errors.date ? (
                <p className="text-xs text-failed">{errors.date.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startTime">Horário</Label>
              <Input id="startTime" type="time" {...register("startTime")} />
              {errors.startTime ? (
                <p className="text-xs text-failed">{errors.startTime.message}</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="durationMinutes">Duração (minutos)</Label>
              <Input id="durationMinutes" inputMode="numeric" {...register("durationMinutes")} />
              {errors.durationMinutes ? (
                <p className="text-xs text-failed">{errors.durationMinutes.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="modality">Modalidade</Label>
              <div className="flex flex-wrap gap-2">
                {APPOINTMENT_MODALITY_VALUES.map((value) => (
                  <label
                    key={value}
                    className="cursor-pointer rounded-xl border border-border px-3 py-2 text-sm font-medium transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
                  >
                    <input type="radio" value={value} className="sr-only" {...register("modality")} />
                    {MODALITY_LABELS[value]}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={isPending}>
              {appointment ? "Salvar" : "Agendar"}
            </Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
