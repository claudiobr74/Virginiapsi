"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { SearchField } from "@/components/ui/search-field";
import {
  PATIENT_STATUS_LABELS,
  PATIENT_STATUS_VALUES,
  type PatientStatus,
} from "@/features/patients/contracts";
import { cn } from "@/lib/utils/cn";

const STATUS_FILTERS: Array<{ value: PatientStatus | "all"; label: string }> = [
  { value: "all", label: "Todos" },
  ...PATIENT_STATUS_VALUES.map((value) => ({
    value,
    label: PATIENT_STATUS_LABELS[value],
  })),
];

export function PatientsToolbar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [, startTransition] = useTransition();

  const activeStatus = (searchParams.get("status") ?? "all") as
    | PatientStatus
    | "all";

  function pushParams(next: { search?: string; status?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    const nextSearch = next.search ?? search;
    const nextStatus = next.status ?? activeStatus;

    if (nextSearch) {
      params.set("search", nextSearch);
    } else {
      params.delete("search");
    }

    if (nextStatus && nextStatus !== "all") {
      params.set("status", nextStatus);
    } else {
      params.delete("status");
    }

    startTransition(() => {
      router.push(`/app/patients?${params.toString()}`);
    });
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <SearchField
        value={search}
        onChange={(value) => {
          setSearch(value);
          pushParams({ search: value });
        }}
        placeholder="Buscar por nome, CPF ou código (PAC-###)…"
      />
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => pushParams({ status: filter.value })}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
              activeStatus === filter.value
                ? "bg-sage-light text-sage-700"
                : "border border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
}
