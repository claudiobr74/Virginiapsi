import { cn } from "@/lib/utils/cn";

export const SURFACE_TONES = [
  "neutral",
  "agenda",
  "clinical",
  "finance",
  "tasks",
  "documents",
  "knowledge",
  "settings",
] as const;

export type SurfaceTone = (typeof SURFACE_TONES)[number];

export const TONE_SURFACE: Record<SurfaceTone, string> = {
  neutral: "border-border bg-card",
  agenda: "border-tone-agenda-border bg-tone-agenda",
  clinical: "border-tone-clinical-border bg-tone-clinical",
  finance: "border-tone-finance-border bg-tone-finance",
  tasks: "border-tone-tasks-border bg-tone-tasks",
  documents: "border-tone-documents-border bg-tone-documents",
  knowledge: "border-tone-knowledge-border bg-tone-knowledge",
  settings: "border-tone-settings-border bg-tone-settings",
};

export const TONE_OUTLINE: Record<SurfaceTone, string> = {
  neutral: "border-border bg-card",
  agenda: "border-tone-agenda-border bg-card",
  clinical: "border-tone-clinical-border bg-card",
  finance: "border-tone-finance-border bg-card",
  tasks: "border-tone-tasks-border bg-card",
  documents: "border-tone-documents-border bg-card",
  knowledge: "border-tone-knowledge-border bg-card",
  settings: "border-tone-settings-border bg-card",
};

export const TONE_HEADER: Record<SurfaceTone, string> = {
  neutral: "border-border bg-surface",
  agenda: "border-tone-agenda-border bg-tone-agenda",
  clinical: "border-tone-clinical-border bg-tone-clinical",
  finance: "border-tone-finance-border bg-tone-finance",
  tasks: "border-tone-tasks-border bg-tone-tasks",
  documents: "border-tone-documents-border bg-tone-documents",
  knowledge: "border-tone-knowledge-border bg-tone-knowledge",
  settings: "border-tone-settings-border bg-tone-settings",
};

export const TONE_ICON_WRAP: Record<SurfaceTone, string> = {
  neutral: "bg-surface text-sage-700",
  agenda: "bg-tone-agenda-soft text-tone-agenda-icon",
  clinical: "bg-tone-clinical-soft text-tone-clinical-icon",
  finance: "bg-tone-finance-soft text-tone-finance-icon",
  tasks: "bg-tone-tasks-soft text-tone-tasks-icon",
  documents: "bg-tone-documents-soft text-tone-documents-icon",
  knowledge: "bg-tone-knowledge-soft text-tone-knowledge-icon",
  settings: "bg-tone-settings-soft text-tone-settings-icon",
};

export const TONE_ICON: Record<SurfaceTone, string> = {
  neutral: "text-sage-700",
  agenda: "text-tone-agenda-icon",
  clinical: "text-tone-clinical-icon",
  finance: "text-tone-finance-icon",
  tasks: "text-tone-tasks-icon",
  documents: "text-tone-documents-icon",
  knowledge: "text-tone-knowledge-icon",
  settings: "text-tone-settings-icon",
};

export function toneSurfaceClass(tone: SurfaceTone = "neutral", extra?: string) {
  return cn("border", TONE_SURFACE[tone], extra);
}

export function toneHeaderClass(tone: SurfaceTone = "neutral", extra?: string) {
  return cn(TONE_HEADER[tone], extra);
}

export function toneIconWrapClass(tone: SurfaceTone = "neutral", extra?: string) {
  return cn(TONE_ICON_WRAP[tone], extra);
}
