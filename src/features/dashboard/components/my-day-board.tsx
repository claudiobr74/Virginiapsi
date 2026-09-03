"use client";

import { useMemo } from "react";
import type { MeetRequestAction } from "@/features/calendar/components/meet-action-button";
import { useAgendaClock } from "@/features/calendar/use-agenda-clock";
import { GoogleMeetPanel } from "@/features/dashboard/components/google-meet-panel";
import { NextSessionCard } from "@/features/dashboard/components/next-session-card";
import { RecentDocumentsPanel } from "@/features/dashboard/components/recent-documents-panel";
import { SessionsToFinalizePanel } from "@/features/dashboard/components/sessions-to-finalize-panel";
import { TasksPanel } from "@/features/dashboard/components/tasks-panel";
import { TodayTimeline } from "@/features/dashboard/components/today-timeline";
import type { MyDaySnapshot } from "@/features/dashboard/contracts";
import { FinancialPendingPanel } from "@/features/finance/components/financial-pending-panel";

export function MyDayBoard({
  snapshot,
  requestMeetAction,
}: {
  snapshot: MyDaySnapshot;
  requestMeetAction?: MeetRequestAction;
}) {
  const emptyDay = snapshot.timeline.length === 0;
  const endsAtList = useMemo(
    () => snapshot.timeline.map((appointment) => appointment.endsAt),
    [snapshot.timeline],
  );
  const now = useAgendaClock(endsAtList);

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
      <div
        data-myday-region="primary"
        className="flex min-w-0 flex-col gap-6"
      >
        <NextSessionCard
          appointment={snapshot.nextSession}
          timeZone={snapshot.timezone}
          canStartSession={snapshot.canStartSession}
          requestMeetAction={requestMeetAction}
          emptyDay={emptyDay}
          now={now}
        />

        <TodayTimeline
          appointments={snapshot.timeline}
          timeZone={snapshot.timezone}
          highlightedId={snapshot.nextSession?.id}
          canStartSession={snapshot.canStartSession}
          now={now}
        />
      </div>

      <aside
        data-myday-region="secondary"
        className="flex min-w-0 flex-col gap-6"
      >
        <GoogleMeetPanel
          appointments={snapshot.timeline}
          timeZone={snapshot.timezone}
          now={now}
          requestMeetAction={requestMeetAction}
        />
        <SessionsToFinalizePanel
          sessions={snapshot.sessionsToFinalize}
          timeZone={snapshot.timezone}
        />
        <FinancialPendingPanel charges={snapshot.financialPending} />
        <TasksPanel tasks={snapshot.tasks} />
        <RecentDocumentsPanel documents={snapshot.recentDocuments} />
      </aside>
    </div>
  );
}
