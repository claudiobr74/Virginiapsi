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
  retryGoogleSyncAction,
} from "@/features/calendar/appointment-actions";
import {
  APPOINTMENT_MODALITY_VALUES,
  appointmentFormSchema,
  type AppointmentFormValues,
  type AppointmentRow,
} from "@/features/calendar/contracts";
import { MODALITY_LABELS } from "@/features/patients/contracts";
import type { PatientRow } from "@/features/patients/contracts";
import { civilDateInTimeZone, civilTimeInTimeZone } from "@/lib/utils/timezone";

export interface AppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patients: Pick<PatientRow, "id" | "preferred_name" | "public_code">[];
  defaultDate: string;
  timeZone: string;
  appointment?: AppointmentRow;
  onSaved: () => void;
}

function defaultValues(
  defaultDate: string,
  timeZone: string,
  appointment?: AppointmentRow,
): AppointmentFormValues {
  if (!appointment) {
    return {
      title: "",
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
  const durationMinutes = Math.max(10, Math.round((ends.getTime() - starts.getTime()) / 60_000));

  return {
    title: appointment.summary_snapshot ?? "",
    patientId: appointment.patient_id ?? "",
    date: civilDateInTimeZone(appointment.starts_at, timeZone),
    startTime: civilTimeInTimeZone(appointment.starts_at, timeZone),
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
  timeZone,
  appointment,
  onSaved,
}: AppointmentDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [conflict, setConflict] = useState(false);
  const [syncRetryId, setSyncRetryId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentFormSchema),
    values: defaultValues(defaultDate, timeZone, appointment),
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
      if (result.syncError && result.appointmentId) {
        setSyncRetryId(result.appointmentId);
        setError("root", { message: result.syncError });
        return;
      }

      setConflict(false);
      setSyncRetryId(null);
      reset();
      onSaved();
      onOpenChange(false);
    });
  }

  const onSubmit = handleSubmit((values) => submit(values, false));

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        title={appointment ? "Editar agendamento" : "Novo agendamento"}
        description="O título aparece na Agenda exatamente como informado."
      >
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.root ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
            >
              <p>{errors.root.message}</p>
              {syncRetryId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  isLoading={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await retryGoogleSyncAction(syncRetryId);
                      if (result.error) {
                        setError("root", { message: result.error });
                        return;
                      }
                      setSyncRetryId(null);
                      reset();
                      onSaved();
                      onOpenChange(false);
                    });
                  }}
                >
                  Tentar novamente
                </Button>
              ) : null}
            </div>
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
            <Label htmlFor="title">Título</Label>
            <Input id="title" {...register("title")} />
            {errors.title ? <p className="text-xs text-failed">{errors.title.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="patientId">Paciente (opcional)</Label>
            <select
              id="patientId"
              className="h-11 rounded-xl border border-border bg-input px-3.5 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register("patientId", {
                onChange: (event) => {
                  const id = event.target.value;
                  const patient = patients.find((row) => row.id === id);
                  if (patient && !getValues("title").trim()) {
                    setValue("title", patient.preferred_name, { shouldValidate: true });
                  }
                },
              })}
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
              {errors.date ? <p className="text-xs text-failed">{errors.date.message}</p> : null}
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
