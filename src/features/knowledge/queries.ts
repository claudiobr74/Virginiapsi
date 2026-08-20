import "server-only";

import {
  knowledgeCollectionRowSchema,
  knowledgeSourceRowSchema,
  type KnowledgeCollectionRow,
  type KnowledgeSourceRow,
} from "@/features/knowledge/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function listCollections(organizationId: string): Promise<KnowledgeCollectionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("knowledge_collections")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`failed to list knowledge collections: ${error.message}`);
  }
  return knowledgeCollectionRowSchema.array().parse(data ?? []);
}

export async function listSources(
  organizationId: string,
  filters: { collectionId?: string } = {},
): Promise<KnowledgeSourceRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("knowledge_sources")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (filters.collectionId) {
    query = query.eq("collection_id", filters.collectionId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`failed to list knowledge sources: ${error.message}`);
  }
  return knowledgeSourceRowSchema.array().parse(data ?? []);
}

export async function getSource(
  organizationId: string,
  sourceId: string,
): Promise<KnowledgeSourceRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("knowledge_sources")
    .select("*")
    .eq("id", sourceId)
    .maybeSingle();

  if (error) {
    throw new Error(`failed to load knowledge source: ${error.message}`);
  }
  if (!data) return null;
  const source = knowledgeSourceRowSchema.parse(data);
  return source.organization_id === organizationId ? source : null;
}
