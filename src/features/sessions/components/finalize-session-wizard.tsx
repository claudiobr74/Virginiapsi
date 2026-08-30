"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent, ModalTrigger } from "@/components/ui/modal";
import { AppointmentDialog } from "@/features/calendar/components/appointment-dialog";
import { createSessionChargeAction } from "@/features/finance/actions";
import { cancelSessionAction, finalizeSessionAction } from "@/features/sessions/actions";
import type { PatientRow } from "@/features/patients/contracts";
import { CLINICAL_SESSION_STATUS_LABELS, type ClinicalSessionStatus } from "@/features/sessions/contracts";

export interface FinalizeSessionWizardProps {
  sessionId: string;
  patientId: string;
  patientDisplayName: string;
  sessionDateLabel: string;
  durationLabel: string;
  status: ClinicalSessionStatus;
  dpepFilled: { demand: boolean; procedures: boolean; evolution: boolean; plan: boolean };
  pendingNotes: string[];
  canCharge: boolean;
  patients: Pick<PatientRow, "id" | "preferred_name" | "public_code">[];
  defaultDate: string;
  hideTrigger?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type WizardStep = "clinical" | "next" | "charge" | "summary";

export function FinalizeSessionWizard({
  sessionId,
  patientId,
  patientDisplayName,
  sessionDateLabel,
  durationLabel,
  status,
  dpepFilled,
  pendingNotes,
  canCharge,
  patients,
  defaultDate,
  hideTrigger = false,
  onOpenChange,
}: FinalizeSessionWizardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>("clinical");
  const [isFinalizing, startFinalize] = useTransition();
  const [isCharging, startCharge] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [sessionFinalized, setSessionFinalized] = useState(false);
  const [nextScheduled, setNextScheduled] = useState(false);
  const [chargeRegistered, setChargeRegistered] = useState(false);
  const [chargeSkipped, setChargeSkipped] = useState(false);

  function resetFlow() {
    setStep("clinical");
    setError(null);
    setScheduleOpen(false);
    setSessionFinalized(false);
    setNextScheduled(false);
    setChargeRegistered(false);
    setChargeSkipped(false);
  }

  function afterFinalize() {
    setSessionFinalized(true);
    setStep("next");
  }

  function afterNextChoice() {
    if (canCharge) {
      setStep("charge");
      return;
    }
    setStep("summary");
  }

  function closeWizard() {
    setOpen(false);
    resetFlow();
    onOpenChange?.(false);
    router.refresh();
  }

  function finalize() {
    setError(null);
    startFinalize(async () => {
      const result = await finalizeSessionAction(sessionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      afterFinalize();
      onOpenChange?.(true);
    });
  }

  function cancel() {
    setError(null);
    startFinalize(async () => {
      const result = await cancelSessionAction(sessionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      closeWizard();
    });
  }

  function registerCharge() {
    setError(null);
    startCharge(async () => {
      const result = await createSessionChargeAction(sessionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setChargeRegistered(Boolean(result.id));
      setChargeSkipped(!result.id);
      setStep("summary");
    });
  }

  const dpepBits = [
    dpepFilled.demand ? "Demanda" : null,
    dpepFilled.procedures ? "Procedimentos" : null,
    dpepFilled.evolution ? "Evolução" : null,
    dpepFilled.plan ? "Plano" : null,
  ].filter(Boolean);

  const footer =
    step === "clinical" ? (
      <>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Voltar
        </Button>
        <Button type="button" variant="secondary" size="sm" isLoading={isFinalizing} onClick={cancel}>
          Cancelar sessão
        </Button>
        <Button type="button" size="sm" isLoading={isFinalizing} onClick={finalize}>
          Finalizar
        </Button>
      </>
    ) : step === "next" ? (
      <>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            afterNextChoice();
          }}
        >
          Depois
        </Button>
        <Button type="button" size="sm" onClick={() => setScheduleOpen(true)}>
          Agora
        </Button>
      </>
    ) : step === "charge" ? (
      <>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setChargeSkipped(true);
            setStep("summary");
          }}
        >
          Não registrar agora
        </Button>
        <Button type="button" size="sm" isLoading={isCharging} onClick={registerCharge}>
          Registrar cobrança
        </Button>
      </>
    ) : (
      <Button type="button" size="sm" onClick={closeWizard}>
        Concluir
      </Button>
    );

  const title =
    step === "clinical"
      ? "Encerramento clínico"
      : step === "next"
        ? "Próximo encontro"
        : step === "charge"
          ? "Cobrança desta sessão"
          : "Resumo do encerramento";

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          onOpenChange?.(next);
          if (!next) {
            resetFlow();
            router.refresh();
          }
        }}
      >
        {hideTrigger ? null : (
          <ModalTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="border-failed/40 bg-failed-bg text-failed hover:bg-failed-bg hover:text-failed"
            >
              Finalizar atendimento
            </Button>
          </ModalTrigger>
        )}
        <ModalContent title={title} description={undefined} footer={footer}>
          {error ? (
            <p role="alert" className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed">
              {error}
            </p>
          ) : null}

          {step === "clinical" ? (
            <div className="flex flex-col gap-3 text-sm">
              <dl className="grid grid-cols-2 gap-2 text-muted-foreground">
                <div>
                  <dt className="text-xs font-semibold uppercase">Paciente</dt>
                  <dd className="text-foreground">{patientDisplayName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase">Data</dt>
                  <dd className="text-foreground">{sessionDateLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase">Duração</dt>
                  <dd className="text-foreground">{durationLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase">Status</dt>
                  <dd className="text-foreground">{CLINICAL_SESSION_STATUS_LABELS[status]}</dd>
                </div>
              </dl>
              <p className="text-muted-foreground">
                DPEP: {dpepBits.length > 0 ? dpepBits.join(", ") : "ainda sem campos preenchidos"}.
              </p>
              {pendingNotes.length > 0 ? (
                <p className="text-muted-foreground">Pendências: {pendingNotes.join("; ")}.</p>
              ) : (
                <p className="text-muted-foreground">Nenhuma pendência clínica listada.</p>
              )}
            </div>
          ) : null}

          {step === "next" ? (
            <p className="text-sm text-muted-foreground">Deseja agendar o próximo encontro?</p>
          ) : null}

          {step === "charge" ? (
            <p className="text-sm text-muted-foreground">Registrar cobrança desta sessão?</p>
          ) : null}

          {step === "summary" ? (
            <ul className="flex flex-col gap-1 text-sm text-foreground">
              {sessionFinalized ? <li>✓ sessão finalizada</li> : null}
              {nextScheduled ? <li>✓ próximo encontro agendado</li> : null}
              {chargeRegistered ? <li>✓ cobrança registrada</li> : null}
              {chargeRegistered ? (
                <li>Recibo: gere após o pagamento no Financeiro.</li>
              ) : null}
              {chargeSkipped && canCharge ? <li>Cobrança não registrada agora.</li> : null}
            </ul>
          ) : null}
        </ModalContent>
      </Modal>

      <AppointmentDialog
        open={scheduleOpen}
        onOpenChange={(next) => {
          setScheduleOpen(next);
          if (!next && step === "next" && !nextScheduled) {
            afterNextChoice();
          }
        }}
        patients={patients}
        defaultDate={defaultDate}
        defaultPatientId={patientId}
        onSaved={() => {
          setNextScheduled(true);
          setScheduleOpen(false);
          afterNextChoice();
          router.refresh();
        }}
      />
    </>
  );
}
