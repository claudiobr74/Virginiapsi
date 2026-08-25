"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type PatientHubTabId =
  | "overview"
  | "record"
  | "plan"
  | "sessions"
  | "documents"
  | "finance"
  | "consents";

const TAB_ALIASES: Record<string, PatientHubTabId> = {
  tcle: "consents",
  overview: "overview",
  record: "record",
  plan: "plan",
  sessions: "sessions",
  documents: "documents",
  finance: "finance",
  consents: "consents",
};

export function parsePatientHubTab(
  value: string | undefined,
  available: PatientHubTabId[],
): PatientHubTabId {
  const mapped = value ? TAB_ALIASES[value] : undefined;
  if (mapped && available.includes(mapped)) {
    return mapped;
  }
  return available[0] ?? "overview";
}

export function PatientHub({
  backHref,
  registeredAt,
  identity,
  overview,
  record,
  plan,
  sessions,
  documents,
  finance,
  consents,
  initialTab,
}: {
  backHref: string;
  registeredAt: string;
  identity: ReactNode;
  overview: ReactNode;
  record?: ReactNode;
  plan?: ReactNode;
  sessions?: ReactNode;
  documents: ReactNode;
  finance: ReactNode;
  consents?: ReactNode;
  initialTab?: PatientHubTabId;
}) {
  const tabs: Array<{ id: PatientHubTabId; label: string; panel: ReactNode }> = [
    { id: "overview", label: "Resumo", panel: overview },
    ...(record ? [{ id: "record" as const, label: "Prontuário", panel: record }] : []),
    ...(plan ? [{ id: "plan" as const, label: "Plano Terapêutico", panel: plan }] : []),
    ...(sessions ? [{ id: "sessions" as const, label: "Sessões", panel: sessions }] : []),
    { id: "documents", label: "Documentos", panel: documents },
    { id: "finance", label: "Financeiro", panel: finance },
    ...(consents
      ? [{ id: "consents" as const, label: "Consentimentos", panel: consents }]
      : []),
  ];
  const available = tabs.map((tab) => tab.id);
  const [tab, setTab] = useState<PatientHubTabId>(() =>
    parsePatientHubTab(initialTab, available),
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
    url.hash = next === "consents" ? "tcle" : "";
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-sage-700 hover:text-primary"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Voltar para Lista
        </Link>
        <p className="font-mono text-xs text-muted-foreground">Cadastro: {registeredAt}</p>
      </div>

      <div className="flex flex-col gap-5 rounded-[20px] border border-border bg-card p-5 sm:p-6">
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
                  "border-b-2 pb-2 text-[15px] transition-colors",
                  selected
                    ? "border-sage-700 font-semibold text-sage-700"
                    : "border-transparent font-medium text-muted-foreground hover:text-foreground",
                )}
                onClick={() => select(item.id)}
              >
                {item.label}
                {item.id === "consents" ? (
                  <span className="sr-only"> TCLE</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel">{active?.panel}</div>
    </div>
  );
}
