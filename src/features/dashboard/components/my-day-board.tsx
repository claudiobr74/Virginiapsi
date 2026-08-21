import { NextSessionCard } from "@/features/dashboard/components/next-session-card";
import { RecentDocumentsPanel } from "@/features/dashboard/components/recent-documents-panel";
import { SessionsToFinalizePanel } from "@/features/dashboard/components/sessions-to-finalize-panel";
import { TasksPanel } from "@/features/dashboard/components/tasks-panel";
import { TodayTimeline } from "@/features/dashboard/components/today-timeline";
import { FinancialPendingPanel } from "@/features/finance/components/financial-pending-panel";
import type { MyDaySnapshot } from "@/features/dashboard/contracts";

export function MyDayBoard({ snapshot }: { snapshot: MyDaySnapshot }) {
  const emptyDay = snapshot.timeline.length === 0;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <NextSessionCard
          appointment={snapshot.nextSession}
          timeZone={snapshot.timezone}
          canStartSession={snapshot.canStartSession}
          emptyDay={emptyDay}
        />
        <TodayTimeline
          appointments={snapshot.timeline}
          timeZone={snapshot.timezone}
          highlightedId={snapshot.nextSession?.id}
          canStartSession={snapshot.canStartSession}
        />
      </div>
      <aside className="flex w-full flex-col gap-5 lg:w-[320px] lg:shrink-0">
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
