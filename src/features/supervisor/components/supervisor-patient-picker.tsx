"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchField } from "@/components/ui/search-field";
import { PatientAvatar } from "@/features/patients/components/patient-avatar";
import { MODALITY_LABELS, type PatientRow } from "@/features/patients/contracts";

export function SupervisorPatientPicker({ patients }: { patients: PatientRow[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return patients;
    }
    return patients.filter((patient) => {
      const haystack = [
        patient.preferred_name,
        patient.full_name,
        patient.public_code,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [patients, search]);

  return (
    <section className="flex flex-col gap-6 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-xl font-semibold italic text-foreground">
          Selecionar paciente
        </h2>
        <p className="text-sm text-muted-foreground">Selecione um paciente para iniciar</p>
      </div>

      <SearchField
        value={search}
        onChange={setSearch}
        placeholder="Buscar por nome ou código (PAC-###)…"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum paciente encontrado para essa busca.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((patient) => (
            <li key={patient.id}>
              <Link
                href={`/app/supervisor?patientId=${patient.id}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-sage-light/10 px-4 py-4 transition-colors hover:border-primary/40 hover:bg-sage-light/20 sm:px-5"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <PatientAvatar name={patient.preferred_name} size="md" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-semibold text-foreground">
                      {patient.preferred_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {MODALITY_LABELS[patient.modality]}
                      <span className="mx-1.5 text-border">·</span>
                      <span className="font-mono">{patient.public_code}</span>
                    </span>
                  </span>
                </span>
                <span className="hidden rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground sm:inline">
                  Selecionar
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
