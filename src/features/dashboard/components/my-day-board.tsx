import { NextSessionCard } from "@/features/dashboard/components/next-session-card";
import { RecentDocumentsPanel } from "@/features/dashboard/components/recent-documents-panel";
import { SessionsToFinalizePanel } from "@/features/dashboard/components/sessions-to-finalize-panel";
import { TasksPanel } from "@/features/dashboard/components/tasks-panel";
import { TodayTimeline } from "@/features/dashboard/components/today-timeline";
import { FinancialPendingPanel } from "@/features/finance/components/financial-pending-panel";
import type { MyDaySnapshot } from "@/features/dashboard/contracts";

export function MyDayBoard({ snapshot }: { snapshot: MyDaySnapshot }) {
  return (
    <div className="flex flex-col gap-8">
      <NextSessionCard appointment={snapshot.nextSession} timeZone={snapshot.timezone} />
      <TodayTimeline
        appointments={snapshot.timeline}
        timeZone={snapshot.timezone}
        highlightedId={snapshot.nextSession?.id}
      />
      <SessionsToFinalizePanel
        sessions={snapshot.sessionsToFinalize}
        timeZone={snapshot.timezone}
      />
      <FinancialPendingPanel charges={snapshot.financialPending} />
      <TasksPanel tasks={snapshot.tasks} />
      <RecentDocumentsPanel documents={snapshot.recentDocuments} />
    </div>
  );
}
