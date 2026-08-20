// Shared shape from docs/16-runtime-ai-data-contracts.md §RetrievedChunk —
// used by Knowledge (Fase 8) and referenced by Supervisor (Fase 7) for its
// still-empty `retrievedKnowledge` field.
export interface RetrievedChunk {
  chunkId: string;
  sourceId: string;
  title?: string;
  author?: string;
  year?: number;
  location?: string;
  documentType?: string;
  studyDesignOrSourceRole?: string;
  populationContext?: string;
  text: string;
  retrievalScore: number;
}
