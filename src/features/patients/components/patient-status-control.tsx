"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal, ModalContent, ModalTrigger } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { updatePatientStatusAction } from "@/features/patients/actions";
import {
  PATIENT_STATUS_BADGE,
  PATIENT_STATUS_LABELS,
  PATIENT_STATUS_VALUES,
  type PatientStatus,
} from "@/features/patients/contracts";

export function PatientStatusControl({
  patientId,
  status,
}: {
  patientId: string;
  status: PatientStatus;
}) {
  const [open, setOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function applyStatus(next: PatientStatus) {
    setError(null);
    startTransition(async () => {
      const result = await updatePatientStatusAction(patientId, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setConfirmArchive(false);
    });
  }

  function handleSelect(next: PatientStatus) {
    if (next === "archived") {
      setConfirmArchive(true);
      return;
    }
    applyStatus(next);
  }

  return (
    <>
      <Modal open={open} onOpenChange={setOpen}>
        <ModalTrigger asChild>
          <button type="button" className="inline-flex items-center gap-2">
            <StatusBadge
              status={PATIENT_STATUS_BADGE[status]}
              label={PATIENT_STATUS_LABELS[status]}
            />
            <span className="text-xs font-semibold text-sage-700 underline-offset-2 hover:underline">
              Alterar situação
            </span>
          </button>
        </ModalTrigger>
        <ModalContent
          title="Alterar situação do paciente"
          description="A mudança fica registrada na auditoria do consultório."
        >
          {error ? (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
            >
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            {PATIENT_STATUS_VALUES.map((value) => (
              <Button
                key={value}
                type="button"
                variant={value === status ? "primary" : "secondary"}
                isLoading={isPending}
                disabled={value === status}
                className="justify-start"
                onClick={() => handleSelect(value)}
              >
                {PATIENT_STATUS_LABELS[value]}
              </Button>
            ))}
          </div>
        </ModalContent>
      </Modal>

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Arquivar paciente?"
        description="O paciente sai das listas ativas. Você pode reverter a situação depois, se precisar."
        confirmLabel="Arquivar"
        isLoading={isPending}
        onConfirm={() => applyStatus("archived")}
      />
    </>
  );
}
