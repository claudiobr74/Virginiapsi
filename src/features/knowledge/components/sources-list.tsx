"use client";

import { RotateCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  KNOWLEDGE_SOURCE_STATUS_LABELS,
  type KnowledgeSourceRow,
} from "@/features/knowledge/contracts";
import { deleteSourceAction, retryIngestionAction } from "@/features/knowledge/actions";

const STATUS_BADGE = {
  uploaded: "pending",
  processing: "pending",
  ready: "completed",
  failed: "failed",
} as const;

export function SourcesList({ sources }: { sources: KnowledgeSourceRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (sources.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma fonte enviada ainda.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {sources.map((source) => (
        <div
          key={source.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface/40 px-3 py-2 text-sm"
        >
          <div className="flex flex-col">
            <span className="font-semibold text-foreground">
              {source.title ?? source.storage_path.split("/").pop()}
            </span>
            {source.authors.length > 0 ? (
              <span className="text-xs text-muted-foreground">{source.authors.join(", ")}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge
              status={STATUS_BADGE[source.status]}
              label={KNOWLEDGE_SOURCE_STATUS_LABELS[source.status]}
              pulse={source.status === "processing"}
            />
            {source.status === "failed" ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                isLoading={isPending}
                aria-label="Tentar processar de novo"
                onClick={() =>
                  startTransition(async () => {
                    await retryIngestionAction(source.id);
                    router.refresh();
                  })
                }
              >
                <RotateCw className="size-3.5" aria-hidden />
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="destructive"
              aria-label="Remover fonte"
              isLoading={isPending}
              onClick={() =>
                startTransition(async () => {
                  await deleteSourceAction(source.id);
                  router.refresh();
                })
              }
            >
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
