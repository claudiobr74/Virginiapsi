export const PENDENCY_KIND_VALUES = [
  "clinical_record",
  "document",
  "payment",
  "consent",
  "task",
] as const;
export type PendencyKind = (typeof PENDENCY_KIND_VALUES)[number];

export const PENDENCY_PRIORITY_VALUES = ["high", "medium", "low"] as const;
export type PendencyPriority = (typeof PENDENCY_PRIORITY_VALUES)[number];

export interface PendencyItem {
  id: string;
  kind: PendencyKind;
  priority: PendencyPriority;
  title: string;
  subtitle: string;
  href: string;
  actionLabel: string;
  createdAt: string;
}

export const PENDENCY_KIND_LABELS: Record<PendencyKind, string> = {
  clinical_record: "Registros clínicos",
  document: "Documentos",
  payment: "Pagamentos em atraso",
  consent: "Consentimentos",
  task: "Tarefas",
};

export const PENDENCY_PRIORITY_LABELS: Record<PendencyPriority, string> = {
  high: "Prioridade alta",
  medium: "Prioridade média",
  low: "Prioridade baixa",
};

export const PENDENCY_PRIORITY_HEADINGS: Record<PendencyPriority, string> = {
  high: "Prioridade alta (ação imediata)",
  medium: "Prioridade média",
  low: "Prioridade baixa",
};

export function countByKind(items: PendencyItem[]): Record<PendencyKind | "total", number> {
  const counts: Record<PendencyKind | "total", number> = {
    clinical_record: 0,
    document: 0,
    payment: 0,
    consent: 0,
    task: 0,
    total: items.length,
  };
  for (const item of items) {
    counts[item.kind] += 1;
  }
  return counts;
}

export function groupByPriority(
  items: PendencyItem[],
): Record<PendencyPriority, PendencyItem[]> {
  return {
    high: items.filter((item) => item.priority === "high"),
    medium: items.filter((item) => item.priority === "medium"),
    low: items.filter((item) => item.priority === "low"),
  };
}

export function relativeTimeLabel(iso: string, nowMs = Date.now()): string {
  const delta = nowMs - new Date(iso).getTime();
  const days = Math.max(0, Math.floor(delta / (24 * 60 * 60 * 1000)));
  if (days === 0) {
    return "hoje";
  }
  if (days === 1) {
    return "há 1 dia";
  }
  return `há ${days} dias`;
}
