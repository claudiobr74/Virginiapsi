import { z } from "zod";

export const documentStudioDraftOutputSchema = z
  .object({
    draft: z.string().min(1),
    reviewNotes: z.array(z.string()).default([]),
    needsHumanReview: z.boolean(),
  })
  .strict();

export type DocumentStudioDraftOutput = z.infer<typeof documentStudioDraftOutputSchema>;
