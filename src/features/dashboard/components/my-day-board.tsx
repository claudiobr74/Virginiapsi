"use client";

import { useMemo } from "react";
import { NextSessionCard } from "@/features/dashboard/components/next-session-card";
import { RecentDocumentsPanel } from "@/features/dashboard/components/recent-documents-panel";
import { SessionsToFinalizePanel } from "@/features/dashboard/components/sessions-to-finalize-panel";
import { TasksPanel } from "@/features/dashboard/components/tasks-panel";
import { TodayTimeline } from "@/features/dashboard/components/today-timeline";
import { FinancialPendingPanel } from "@/features/finance/components/financial-pending-panel";
import type { MyDaySnapshot } from "@/features/dashboard/contracts";
import { useAgendaClock } from "@/features/calendar/use-agenda-clock";

export function MyDayBoard({ snapshot }: { snapshot: MyDaySnapshot }) {
  const emptyDay = snapshot.timeline.length === 0;
  const endsAtList = useMemo(
    () => snapshot.timeline.map((appointment) => appointment.endsAt),
    [snapshot.timeline],
  );
  const now = useAgendaClock(endsAtList);

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,500px)]">
      <NextSessionCard
        appointment={snapshot.nextSession}
        timeZone={snapshot.timezone}
        canStartSession={snapshot.canStartSession}
        emptyDay={emptyDay}
        now={now}
      />
      <aside className="min-w-0 lg:col-start-2 lg:row-span-2">
        <TodayTimeline
          appointments={snapshot.timeline}
          timeZone={snapshot.timezone}
          highlightedId={snapshot.nextSession?.id}
          canStartSession={snapshot.canStartSession}
          now={now}
        />
      </aside>
      <div className="flex min-w-0 flex-col gap-6">
        <SessionsToFinalizePanel
          sessions={snapshot.sessionsToFinalize}
          timeZone={snapshot.timezone}
        />
        <FinancialPendingPanel charges={snapshot.financialPending} />
        <TasksPanel tasks={snapshot.tasks} />
        <RecentDocumentsPanel documents={snapshot.recentDocuments} />
      </div>
    </div>
  );
}
