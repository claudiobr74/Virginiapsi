"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
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
    <div className="flex flex-col gap-3">
      <SearchField
        value={search}
        onChange={(value) => {
          setSearch(value);
          pushParams({ search: value });
        }}
        placeholder="Buscar por nome ou código (PAC-###)…"
      />
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            type="button"
            size="sm"
            variant={activeStatus === filter.value ? "primary" : "secondary"}
            className={cn(activeStatus !== filter.value && "border-border")}
            onClick={() => pushParams({ status: filter.value })}
          >
            {filter.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
