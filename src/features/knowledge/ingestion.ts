import "server-only";

import { RUNTIME_PROMPTS, RUNTIME_PROMPT_VERSION } from "@/lib/ai/prompts";
import { KNOWLEDGE_INGESTION_SCHEMA } from "@/lib/ai/contracts/knowledge";
import { knowledgeIngestionOutputSchema } from "@/lib/ai/validators/knowledge";
import { toGeminiResponseJsonSchema } from "@/lib/ai/schema-adapter";
import { packContext } from "@/lib/ai/context-packer";
import { GeminiClient } from "@/lib/integrations/gemini/client";
import { GeminiEmbeddingsClient } from "@/lib/integrations/gemini/embeddings-client";
import { getServerEnv } from "@/lib/env/server";
import { extractText } from "@/lib/knowledge/extract-text";
import { chunkText } from "@/lib/knowledge/chunking";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Runs the full ingestion pipeline for a source that already has its file
 * uploaded and a `knowledge_sources` row registered: extract text, ask the
 * model for catalog metadata (never clinical judgement — see
 * KNOWLEDGE_INGESTION_PROMPT), chunk, embed and persist. Every step after a
 * failure marks the source 'failed' with a safe error message instead of
 * leaving it stuck in 'processing'.
 */
export async function ingestKnowledgeSource(
  organizationId: string,
  sourceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const env = getServerEnv();

  const { data: source, error: sourceError } = await supabase
    .from("knowledge_sources")
    .select("id, organization_id, storage_path, mime_type, title")
    .eq("id", sourceId)
    .maybeSingle();

  if (sourceError || !source || source.organization_id !== organizationId) {
    return { ok: false, error: "Fonte não encontrada." };
  }

  await supabase
    .from("knowledge_sources")
    .update({ status: "processing", ingestion_error: null })
    .eq("id", sourceId);

  try {
    const { data: file, error: downloadError } = await supabase.storage
      .from("knowledge-sources")
      .download(source.storage_path);
    if (downloadError || !file) {
      throw new Error(`download failed: ${downloadError?.message}`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { text } = await extractText(buffer, source.mime_type);
    if (!text.trim()) {
      throw new Error("extracted text is empty");
    }

    const metadata = await extractCatalogMetadata(env, text, organizationId, sourceId);

    await supabase
      .from("knowledge_sources")
      .update({
        title: source.title || metadata.title || undefined,
        authors: metadata.authors,
        year: metadata.year,
        edition: metadata.edition,
        document_type: metadata.documentType,
        study_design_or_source_role: metadata.studyDesignOrSourceRole,
        language: metadata.language,
        theoretical_approaches: metadata.theoreticalApproaches,
        population_context: metadata.populationContext,
        main_topics: metadata.mainTopics,
        system_tags: metadata.systemTags,
      })
      .eq("id", sourceId);

    const { data: document, error: documentError } = await supabase
      .from("knowledge_documents")
      .upsert(
        { organization_id: organizationId, source_id: sourceId, extracted_text: text, char_count: text.length },
        { onConflict: "source_id" },
      )
      .select("id")
      .single();
    if (documentError || !document) {
      throw new Error(`failed to persist extracted document: ${documentError?.message}`);
    }

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      throw new Error("no chunks produced from extracted text");
    }

    // Chunks are always regenerated wholesale (no UPDATE grant on the
    // table — see the migration) — delete any previous set first so
    // re-ingestion never leaves stale/duplicate chunks behind.
    await supabase.from("knowledge_chunks").delete().eq("document_id", document.id);

    const { data: insertedChunks, error: chunksError } = await supabase
      .from("knowledge_chunks")
      .insert(
        chunks.map((chunk) => ({
          organization_id: organizationId,
          source_id: sourceId,
          document_id: document.id,
          sequence: chunk.sequence,
          text: chunk.text,
          char_start: chunk.charStart,
          char_end: chunk.charEnd,
        })),
      )
      .select("id, sequence");
    if (chunksError || !insertedChunks) {
      throw new Error(`failed to persist chunks: ${chunksError?.message}`);
    }

    const embeddingsClient = new GeminiEmbeddingsClient({ apiKey: env.GEMINI_API_KEY });
    const orderedChunks = [...insertedChunks].sort((a, b) => a.sequence - b.sequence);
    const vectors = await embeddingsClient.embedTexts(
      env.GEMINI_EMBEDDING_MODEL,
      chunks.map((chunk) => chunk.text),
      "RETRIEVAL_DOCUMENT",
    );

    const { error: embeddingsError } = await supabase.from("knowledge_embeddings").insert(
      orderedChunks.map((chunk, index) => ({
        chunk_id: chunk.id,
        organization_id: organizationId,
        embedding: `[${vectors[index].join(",")}]`,
        model: env.GEMINI_EMBEDDING_MODEL,
      })),
    );
    if (embeddingsError) {
      throw new Error(`failed to persist embeddings: ${embeddingsError.message}`);
    }

    await supabase.from("knowledge_sources").update({ status: "ready" }).eq("id", sourceId);
    return { ok: true };
  } catch (error) {
    await supabase
      .from("knowledge_sources")
      .update({
        status: "failed",
        // Safe, generic message — never the raw provider/DB error text,
        // which could leak internals into a field visible in the UI.
        ingestion_error: "Falha ao processar a fonte. Tente novamente.",
      })
      .eq("id", sourceId);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown ingestion failure",
    };
  }
}

async function extractCatalogMetadata(
  env: ReturnType<typeof getServerEnv>,
  text: string,
  organizationId: string,
  sourceId: string,
) {
  const supabase = await createSupabaseServerClient();
  const client = new GeminiClient({ apiKey: env.GEMINI_API_KEY });

  const { data: run } = await supabase
    .from("ai_runs")
    .insert({
      organization_id: organizationId,
      purpose: "knowledge_ingestion",
      provider: "gemini",
      model: env.GEMINI_MODEL_KNOWLEDGE,
      prompt_name: "knowledgeIngestion",
      prompt_version: RUNTIME_PROMPT_VERSION,
      schema_version: RUNTIME_PROMPT_VERSION,
      status: "running",
      source_ids: { sourceId },
    })
    .select("id")
    .single();

  try {
    // Truncated: ingestion metadata only needs the opening portion of most
    // sources (title page, abstract, front matter) — never send the whole
    // document when a representative slice is enough.
    const excerpt = text.slice(0, 20000);
    const raw = await client.generateStructured({
      model: env.GEMINI_MODEL_KNOWLEDGE,
      systemInstruction: RUNTIME_PROMPTS.knowledgeIngestion,
      userContent: packContext([{ label: "RETRIEVED_SOURCE", value: excerpt }]),
      responseJsonSchema: toGeminiResponseJsonSchema(KNOWLEDGE_INGESTION_SCHEMA),
    });
    const validated = knowledgeIngestionOutputSchema.parse(raw);

    if (run) {
      await supabase
        .from("ai_runs")
        .update({ status: "succeeded", completed_at: new Date().toISOString() })
        .eq("id", run.id);
    }
    return validated;
  } catch {
    if (run) {
      await supabase
        .from("ai_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: "ingestion_metadata_failed",
        })
        .eq("id", run.id);
    }
    // Metadata extraction is a cataloging convenience, not a hard
    // dependency — a failure here must not abort chunking/embeddings.
    return {
      title: null,
      authors: [],
      year: null,
      edition: null,
      documentType: null,
      studyDesignOrSourceRole: null,
      language: null,
      theoreticalApproaches: [],
      populationContext: [],
      mainTopics: [],
      systemTags: [],
    };
  }
}
