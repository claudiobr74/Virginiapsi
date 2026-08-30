import { z } from "zod";

export const KNOWLEDGE_SOURCE_STATUS_VALUES = [
  "uploaded",
  "processing",
  "ready",
  "failed",
] as const;
export type KnowledgeSourceStatus = (typeof KNOWLEDGE_SOURCE_STATUS_VALUES)[number];

export const KNOWLEDGE_SOURCE_STATUS_LABELS: Record<KnowledgeSourceStatus, string> = {
  uploaded: "Enviado",
  processing: "Processando",
  ready: "Pronto",
  failed: "Falhou",
};

export const DOCUMENT_TYPE_VALUES = [
  "livro",
  "capitulo",
  "artigo",
  "estudo",
  "revisao",
  "guideline",
  "manual",
  "protocolo",
  "guia",
  "consenso_posicionamento",
  "nota",
  "outro",
] as const;

export const DOCUMENT_TYPE_LABELS: Record<(typeof DOCUMENT_TYPE_VALUES)[number], string> = {
  livro: "Livro",
  capitulo: "Capítulo",
  artigo: "Artigo",
  estudo: "Estudo",
  revisao: "Revisão",
  guideline: "Guideline/Diretriz",
  manual: "Manual",
  protocolo: "Protocolo",
  guia: "Guia",
  consenso_posicionamento: "Consenso/Posicionamento",
  nota: "Nota",
  outro: "Outro",
};

export const knowledgeCollectionRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  created_at: z.string(),
});
export type KnowledgeCollectionRow = z.infer<typeof knowledgeCollectionRowSchema>;

export const knowledgeSourceRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  collection_id: z.string().uuid().nullable(),
  title: z.string().nullable(),
  authors: z.array(z.string()),
  year: z.number().int().nullable(),
  edition: z.string().nullable(),
  document_type: z.string().nullable(),
  study_design_or_source_role: z.string().nullable(),
  language: z.string().nullable(),
  theoretical_approaches: z.array(z.string()),
  population_context: z.array(z.string()),
  main_topics: z.array(z.string()),
  system_tags: z.array(z.string()),
  status: z.enum(KNOWLEDGE_SOURCE_STATUS_VALUES),
  ingestion_error: z.string().nullable(),
  storage_path: z.string(),
  mime_type: z.string(),
  byte_size: z.number(),
  created_at: z.string(),
});
export type KnowledgeSourceRow = z.infer<typeof knowledgeSourceRowSchema>;

export const createCollectionSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da coleção."),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type CreateCollectionValues = z.infer<typeof createCollectionSchema>;

export const registerSourceSchema = z.object({
  collectionId: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(500).optional().or(z.literal("")),
  storagePath: z.string().min(1),
  mimeType: z.enum(["application/pdf", "text/plain", "text/markdown"]),
  byteSize: z.number().int().positive(),
  sha256: z.string().min(1),
});
export type RegisterSourceValues = z.infer<typeof registerSourceSchema>;

export const KNOWLEDGE_MODE_VALUES = [
  "query",
  "synthesis",
  "compare",
  "study",
] as const;
export type KnowledgeMode = (typeof KNOWLEDGE_MODE_VALUES)[number];

export const askKnowledgeSchema = z.object({
  collectionIds: z.array(z.string().uuid()).default([]),
  question: z.string().trim().min(1, "Informe a pergunta."),
});

export const synthesizeKnowledgeSchema = z.object({
  collectionIds: z.array(z.string().uuid()).default([]),
  topic: z.string().trim().min(1, "Informe o tema da síntese."),
});

export const compareKnowledgeSourcesSchema = z.object({
  sourceIds: z.array(z.string().uuid()).min(2, "Selecione ao menos duas fontes."),
  question: z.string().trim().min(1, "Informe o que comparar."),
});

export const studyKnowledgeSchema = z.object({
  collectionIds: z.array(z.string().uuid()).default([]),
  topic: z.string().trim().min(1, "Informe o tema de estudo."),
  format: z.enum([
    "explicacao_progressiva",
    "resumo_estruturado",
    "mapa_conceitual",
    "quadro_comparativo",
    "perguntas_revisao",
    "flashcards",
  ]),
});

export const applyToCaseSchema = z.object({
  patientId: z.string().uuid(),
  collectionIds: z.array(z.string().uuid()).default([]),
  question: z.string().trim().min(1, "Informe a pergunta clínica."),
  additionalNotes: z.string().trim().max(2000).optional().or(z.literal("")),
  selection: z
    .object({
      formulation: z.boolean(),
      therapyGoals: z.boolean(),
      lastSession: z.boolean(),
      lastThreeSessions: z.boolean(),
      dpep: z.boolean(),
      additionalNotes: z.boolean(),
    })
    .default({
      formulation: true,
      therapyGoals: true,
      lastSession: true,
      lastThreeSessions: false,
      dpep: false,
      additionalNotes: false,
    }),
});
