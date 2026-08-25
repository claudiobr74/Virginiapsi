"use client";

import { FileText, NotebookPen, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  PENDENCY_KIND_LABELS,
  PENDENCY_PRIORITY_HEADINGS,
  PENDENCY_PRIORITY_LABELS,
  countByKind,
  groupByPriority,
  relativeTimeLabel,
  type PendencyItem,
  type PendencyKind,
  type PendencyPriority,
} from "@/features/dashboard/pendencies";
import { cn } from "@/lib/utils/cn";

const KIND_ICON: Record<PendencyKind, typeof NotebookPen> = {
  clinical_record: NotebookPen,
  document: FileText,
  payment: Wallet,
  consent: TriangleAlert,
  task: TriangleAlert,
};

export function PendenciesBoard({ items }: { items: PendencyItem[] }) {
  const [priority, setPriority] = useState<PendencyPriority | "all">("all");
  const counts = useMemo(() => countByKind(items), [items]);
  const grouped = useMemo(() => groupByPriority(items), [items]);
  const visiblePriorities: PendencyPriority[] =
    priority === "all" ? ["high", "medium", "low"] : [priority];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {(
          [
            ["clinical_record", counts.clinical_record],
            ["document", counts.document],
            ["payment", counts.payment],
            ["consent", counts.consent],
            ["total", counts.total],
          ] as const
        ).map(([key, value]) => (
          <div
            key={key}
            className="rounded-[16px] border border-border bg-card p-4"
          >
            <p className="text-[13px] text-muted-foreground">
              {key === "total" ? "Total geral" : PENDENCY_KIND_LABELS[key]}
            </p>
            <p className="font-serif text-[28px] font-bold text-foreground">{value}</p>
            <p className="text-[11px] font-semibold uppercase text-pending">Pendente</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "high", "medium", "low"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={priority === value ? "primary" : "secondary"}
            onClick={() => setPriority(value)}
          >
            {value === "all" ? "Todas" : PENDENCY_PRIORITY_LABELS[value]}
          </Button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="rounded-[20px] border border-border bg-card p-6 text-sm text-muted-foreground">
          Nenhuma pendência no momento.
        </p>
      ) : (
        visiblePriorities.map((level) => {
          const group = grouped[level];
          if (group.length === 0) {
            return null;
          }
          return (
            <section key={level} className="flex flex-col gap-3">
              <h2 className="font-serif text-lg font-bold text-accent">
                {PENDENCY_PRIORITY_HEADINGS[level]}
              </h2>
              <ul className="flex flex-col gap-3">
                {group.map((item) => {
                  const Icon = KIND_ICON[item.kind];
                  return (
                    <li
                      key={item.id}
                      className="flex flex-col gap-3 rounded-[16px] border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sage-light text-sage-700">
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{item.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.subtitle}
                            <span className="mx-1.5">·</span>
                            {relativeTimeLabel(item.createdAt)}
                          </p>
                        </div>
                      </div>
                      <Button asChild size="sm" className={cn("shrink-0")}>
                        <Link href={item.href}>{item.actionLabel}</Link>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
