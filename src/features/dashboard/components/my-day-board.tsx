import { NotebookPen } from "lucide-react";
import { NextSessionCard } from "@/features/dashboard/components/next-session-card";
import { RecentDocumentsPanel } from "@/features/dashboard/components/recent-documents-panel";
import { TasksPanel } from "@/features/dashboard/components/tasks-panel";
import { TodayTimeline } from "@/features/dashboard/components/today-timeline";
import { UpcomingPhaseSection } from "@/features/dashboard/components/upcoming-phase-section";
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
      <UpcomingPhaseSection icon={NotebookPen} section={snapshot.sessionsToFinalize} />
      <FinancialPendingPanel charges={snapshot.financialPending} />
      <TasksPanel tasks={snapshot.tasks} />
      <RecentDocumentsPanel documents={snapshot.recentDocuments} />
    </div>
  );
}
