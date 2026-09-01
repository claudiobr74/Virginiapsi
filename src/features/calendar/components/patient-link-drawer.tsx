"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent } from "@/components/ui/modal";
import { SearchField } from "@/components/ui/search-field";
import { extractAppointmentTitleHints } from "@/features/calendar/appointment-title-hints";
import type { AttendTarget } from "@/features/calendar/attend-target";
import {
  linkPatientAndStartSessionAction,
  searchPatientsForAppointmentLinkAction,
  type PatientLinkHit,
} from "@/features/calendar/link-patient-actions";
import { formatInTimeZone } from "@/lib/utils/timezone";
import { cn } from "@/lib/utils/cn";

export function PatientLinkDrawer({
  appointment,
  timeZone,
  open,
  onOpenChange,
  returnTo = "/app",
}: {
  appointment: AttendTarget;
  timeZone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnTo?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<PatientLinkHit[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [isLinking, startLink] = useTransition();

  const titleHints = useMemo(
    () => extractAppointmentTitleHints(appointment.summarySnapshot),
    [appointment.summarySnapshot],
  );
  const timeRange = `${formatInTimeZone(appointment.startsAt, timeZone)}–${formatInTimeZone(appointment.endsAt, timeZone)}`;
  const createHref = `/app/patients/new?returnTo=${encodeURIComponent(returnTo)}`;

  useEffect(() => {
    if (!open) {
      setQuery("");
      setPatients([]);
      setSelectedId(null);
      setError(null);
      return;
    }

    const trimmed = query.trim();
    const handle = window.setTimeout(() => {
      startSearch(async () => {
        const result = await searchPatientsForAppointmentLinkAction({
          query: trimmed,
          titleHints: trimmed.length >= 2 ? [] : titleHints,
        });
        if (result.error) {
          setError(result.error);
          setPatients([]);
          return;
        }
        setPatients(result.patients);
      });
    }, 220);
    return () => window.clearTimeout(handle);
  }, [open, query, titleHints]);

  function confirmLink() {
    if (!selectedId) {
      return;
    }
    setError(null);
    startLink(async () => {
      const result = await linkPatientAndStartSessionAction(appointment.id, selectedId);
      if (result.error || !result.sessionId) {
        setError(result.error ?? "Não foi possível iniciar a sessão.");
        return;
      }
      onOpenChange(false);
      router.push(`/session/${result.sessionId}`);
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title="Vincular paciente"
        description="Vincular paciente para iniciar atendimento"
        size="md"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!selectedId}
              isLoading={isLinking}
              onClick={confirmLink}
            >
              Vincular e atender
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error ? (
            <p role="alert" className="rounded-xl border border-failed/30 bg-failed-bg px-3 py-2 text-sm text-failed">
              {error}
            </p>
          ) : null}

          <div className="rounded-2xl border border-border bg-surface/60 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Agendamento
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {appointment.summarySnapshot ?? "Sem título"}
            </p>
            <p className="font-mono text-xs text-muted-foreground">{timeRange}</p>
          </div>

          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Buscar paciente..."
            aria-label="Buscar paciente"
          />

          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Pacientes encontrados
            </p>
            {isSearching && patients.length === 0 ? (
              <p className="text-sm text-muted-foreground">Buscando…</p>
            ) : patients.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {query.trim().length < 2 && titleHints.length === 0
                  ? "Digite nome, nome preferido ou código de registro."
                  : "Nenhum paciente encontrado. Cadastre um novo se precisar."}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {patients.map((patient) => {
                  const selected = selectedId === patient.id;
                  return (
                    <li key={patient.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(patient.id)}
                        className={cn(
                          "flex w-full flex-col gap-0.5 rounded-2xl border px-4 py-3 text-left transition-colors",
                          selected
                            ? "border-primary bg-sage-light/30"
                            : "border-border bg-card hover:border-primary/40 hover:bg-sage-light/15",
                        )}
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {patient.preferredName}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {patient.publicCode}
                          </span>
                          {patient.suggested ? (
                            <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                              Possível paciente
                            </span>
                          ) : null}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {patient.suggested
                            ? "Sugestão visual pelo título — clique para selecionar."
                            : "Clique para selecionar."}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Link
            href={createHref}
            className="text-sm font-semibold text-sage-700 underline-offset-4 hover:underline"
          >
            Cadastrar novo paciente
          </Link>
        </div>
      </ModalContent>
    </Modal>
  );
}
