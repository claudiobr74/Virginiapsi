import type { KnowledgeOutput } from "@/lib/ai/validators/knowledge";

/**
 * Post-validation gate (docs/15-runtime-ai-test-matrix.md "cada source ID
 * citado pertence ao retrieval"): every sourceId the model claims to cite
 * must be among the chunks actually retrieved for this call. A response
 * citing anything else is malformed output and fails closed — the caller
 * must reject it, not silently strip the bad citation and present the
 * rest as if nothing happened.
 */
export function findFabricatedCitations(
  output: KnowledgeOutput,
  retrievedSourceIds: string[],
): string[] {
  const known = new Set(retrievedSourceIds);
  const cited = new Set<string>();

  for (const claim of output.centralClaims) {
    for (const sourceId of claim.sourceIds) {
      cited.add(sourceId);
    }
  }
  for (const citation of output.citations) {
    cited.add(citation.sourceId);
  }
  for (const appraisal of output.sourceAppraisal) {
    cited.add(appraisal.sourceId);
  }
  for (const disagreement of output.disagreements) {
    for (const position of disagreement.positions) {
      for (const sourceId of position.sourceIds) {
        cited.add(sourceId);
      }
    }
  }

  return [...cited].filter((sourceId) => !known.has(sourceId));
}
