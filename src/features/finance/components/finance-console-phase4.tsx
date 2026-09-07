"use client";

import { useState, type MouseEvent } from "react";
import { FinanceConsole as LegacyFinanceConsole } from "@/features/finance/components/finance-console";
import { FinanceReportsPhase4 } from "@/features/finance/components/finance-reports-phase4";
import {
  todayIsoDate,
  type FinanceSnapshot,
} from "@/features/finance/contracts";

export function FinanceConsolePhase4({
  snapshot,
  patients,
  isAdmin,
  timezone,
}: {
  snapshot: FinanceSnapshot;
  patients: { id: string; preferred_name: string }[];
  isAdmin: boolean;
  timezone: string;
}) {
  const [reportsActive, setReportsActive] = useState(false);
  const today = todayIsoDate(timezone);
  const canWrite = snapshot.access === "manage";

  function handleTabClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const tab = target.closest('[role="tab"]');
    if (!(tab instanceof HTMLElement)) return;
    setReportsActive(tab.textContent?.trim() === "Relatórios");
  }

  return (
    <div
      data-finance-phase4
      data-reports-active={reportsActive ? "true" : "false"}
      className="flex flex-col gap-6"
      onClickCapture={handleTabClick}
    >
      <style>{`
        [data-finance-phase4][data-reports-active="true"] [role="tablist"] + div {
          display: none;
        }
      `}</style>
      <LegacyFinanceConsole
        snapshot={snapshot}
        patients={patients}
        isAdmin={isAdmin}
        timezone={timezone}
      />
      {reportsActive ? (
        <FinanceReportsPhase4
          snapshot={snapshot}
          today={today}
          timezone={timezone}
          canWrite={canWrite}
        />
      ) : null}
    </div>
  );
}
