"use client";

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
  const today = todayIsoDate(timezone);
  const canWrite = snapshot.access === "manage";

  return (
    <div data-finance-phase4 className="flex flex-col gap-8">
      <style>{`
        [data-finance-phase4] [role="tablist"] > button:nth-child(4) {
          display: none;
        }
      `}</style>
      <LegacyFinanceConsole
        snapshot={snapshot}
        patients={patients}
        isAdmin={isAdmin}
        timezone={timezone}
      />
      <FinanceReportsPhase4
        snapshot={snapshot}
        today={today}
        timezone={timezone}
        canWrite={canWrite}
      />
    </div>
  );
}
