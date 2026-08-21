"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type PatientHubTabId =
  | "overview"
  | "sessions"
  | "documents"
  | "finance"
  | "tcle";

function tabFromAvailable(
  available: PatientHubTabId[],
  requested?: PatientHubTabId,
): PatientHubTabId {
  if (requested && available.includes(requested)) {
    return requested;
  }
  return available[0] ?? "overview";
}

export function PatientHub({
  backHref,
  registeredAt,
  identity,
  overview,
  sessions,
  documents,
  finance,
  tcle,
  initialTab,
}: {
  backHref: string;
  registeredAt: string;
  identity: ReactNode;
  overview: ReactNode;
  sessions?: ReactNode;
  documents: ReactNode;
  finance: ReactNode;
  tcle?: ReactNode;
  initialTab?: PatientHubTabId;
}) {
  const tabs: Array<{ id: PatientHubTabId; label: string; panel: ReactNode }> = [
    { id: "overview", label: "Visão Geral", panel: overview },
    ...(sessions
      ? [{ id: "sessions" as const, label: "Sessões", panel: sessions }]
      : []),
    { id: "documents", label: "Documentos", panel: documents },
    { id: "finance", label: "Financeiro", panel: finance },
    ...(tcle ? [{ id: "tcle" as const, label: "TCLE", panel: tcle }] : []),
  ];
  const available = tabs.map((tab) => tab.id);
  const [tab, setTab] = useState<PatientHubTabId>(() =>
    tabFromAvailable(available, initialTab),
  );
  const active = tabs.find((item) => item.id === tab) ?? tabs[0];

  function select(next: PatientHubTabId) {
    setTab(next);
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    if (next === "overview") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", next);
    }
    url.hash = next === "tcle" ? "tcle" : "";
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:text-primary-hover"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Voltar para Lista
        </Link>
        <p className="font-mono text-xs text-muted-foreground">Cadastro: {registeredAt}</p>
      </div>

      <div className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        {identity}
        <div
          className="flex flex-wrap gap-5 border-t border-border pt-4"
          role="tablist"
          aria-label="Seções do prontuário"
        >
          {tabs.map((item) => {
            const selected = item.id === active?.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={cn(
                  "border-b-2 pb-2 text-sm transition-colors",
                  selected
                    ? "border-primary font-semibold text-primary"
                    : "border-transparent font-medium text-muted-foreground hover:text-foreground",
                )}
                onClick={() => select(item.id)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel">{active?.panel}</div>
    </div>
  );
}
