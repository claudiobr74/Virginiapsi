import "server-only";

import type { RetrievedChunk } from "@/lib/ai/retrieved-chunk";
import { GeminiEmbeddingsClient } from "@/lib/integrations/gemini/embeddings-client";
import { getServerEnv } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface RetrievalOptions {
  collectionIds?: string[];
  matchCount?: number;
}

interface VectorMatchRow {
  chunk_id: string;
  source_id: string;
  text: string;
  char_start: number | null;
  char_end: number | null;
  similarity: number;
}

interface SourceMetadata {
  id: string;
  title: string | null;
  authors: string[];
  year: number | null;
  document_type: string | null;
  study_design_or_source_role: string | null;
  population_context: string[];
}

/**
 * Retrieval-first pipeline (docs/14-runtime-ai-architecture.md §8): embeds
 * the query (RETRIEVAL_QUERY task type), runs tenant-scoped pgvector
 * similarity search via `match_knowledge_chunks`, adds a plain-text lexical
 * pass over the same tenant-scoped rows for "busca híbrida", then joins
 * source metadata so the model gets title/author/year/role alongside each
 * chunk — never just a bare id.
 */
export async function retrieveChunks(
  organizationId: string,
  query: string,
  options: RetrievalOptions = {},
): Promise<RetrievedChunk[]> {
  const env = getServerEnv();
  const embeddingsClient = new GeminiEmbeddingsClient({ apiKey: env.GEMINI_API_KEY });
  const [queryEmbedding] = await embeddingsClient.embedTexts(
    env.GEMINI_EMBEDDING_MODEL,
    [query],
    "RETRIEVAL_QUERY",
  );

  const supabase = await createSupabaseServerClient();
  const matchCount = options.matchCount ?? 8;

  const { data: vectorMatches, error: vectorError } = await supabase.rpc(
    "match_knowledge_chunks",
    {
      org_id: organizationId,
      query_embedding: `[${queryEmbedding.join(",")}]`,
      match_count: matchCount,
      collection_ids: options.collectionIds?.length ? options.collectionIds : null,
    },
  );
  if (vectorError) {
    throw new Error(`failed to run vector retrieval: ${vectorError.message}`);
  }

  const lexicalMatches = await lexicalSearch(organizationId, query, options.collectionIds);

  const byChunkId = new Map<string, VectorMatchRow>();
  for (const row of (vectorMatches ?? []) as VectorMatchRow[]) {
    byChunkId.set(row.chunk_id, row);
  }
  for (const row of lexicalMatches) {
    if (!byChunkId.has(row.chunk_id)) {
      byChunkId.set(row.chunk_id, row);
    }
  }

  const rows = [...byChunkId.values()];
  if (rows.length === 0) {
    return [];
  }

  const sourceIds = [...new Set(rows.map((row) => row.source_id))];
  const { data: sources, error: sourcesError } = await supabase
    .from("knowledge_sources")
    .select(
      "id, title, authors, year, document_type, study_design_or_source_role, population_context",
    )
    .in("id", sourceIds);
  if (sourcesError) {
    throw new Error(`failed to load source metadata for retrieval: ${sourcesError.message}`);
  }
  const sourceById = new Map(
    ((sources ?? []) as SourceMetadata[]).map((source) => [source.id, source]),
  );

  return rows
    .sort((a, b) => b.similarity - a.similarity)
    .map((row) => {
      const source = sourceById.get(row.source_id);
      return {
        chunkId: row.chunk_id,
        sourceId: row.source_id,
        title: source?.title ?? undefined,
        author: source?.authors?.length ? source.authors.join(", ") : undefined,
        year: source?.year ?? undefined,
        location: row.char_start !== null ? `chars ${row.char_start}-${row.char_end}` : undefined,
        documentType: source?.document_type ?? undefined,
        studyDesignOrSourceRole: source?.study_design_or_source_role ?? undefined,
        populationContext: source?.population_context?.length
          ? source.population_context.join(", ")
          : undefined,
        text: row.text,
        retrievalScore: row.similarity,
      } satisfies RetrievedChunk;
    });
}

/**
 * Plain keyword pass so a query term that appears verbatim in a chunk
 * still surfaces even when the embedding similarity ranks it low (short
 * technical terms/acronyms are exactly the case vector search alone can
 * miss) — the "hybrid" half of retrieval, deliberately simple.
 */
async function lexicalSearch(
  organizationId: string,
  query: string,
  collectionIds?: string[],
): Promise<VectorMatchRow[]> {
  const terms = query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 4)
    .slice(0, 5);
  if (terms.length === 0) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  let queryBuilder = supabase
    .from("knowledge_chunks")
    .select("id, source_id, text, char_start, char_end, knowledge_sources!inner(collection_id)")
    .eq("organization_id", organizationId)
    .or(terms.map((term) => `text.ilike.%${term}%`).join(","))
    .limit(8);

  if (collectionIds?.length) {
    queryBuilder = queryBuilder.in("knowledge_sources.collection_id", collectionIds);
  }

  const { data, error } = await queryBuilder;
  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    chunk_id: row.id as string,
    source_id: row.source_id as string,
    text: row.text as string,
    char_start: row.char_start as number | null,
    char_end: row.char_end as number | null,
    similarity: 0,
  }));
}
