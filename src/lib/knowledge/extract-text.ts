// Text extraction for knowledge source uploads
// (docs/08-implementation-phases.md Fase 8 "ingestion + extração"). No
// NotebookLM-style external service — extraction runs locally in the
// server, never sending the file to a third party for this step.

const TEXT_MIME_TYPES = new Set(["text/plain", "text/markdown"]);

export interface ExtractedText {
  text: string;
  pageCount?: number;
}

export async function extractText(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<ExtractedText> {
  if (TEXT_MIME_TYPES.has(mimeType)) {
    return { text: fileBuffer.toString("utf8") };
  }

  if (mimeType === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: fileBuffer });
    try {
      const result = await parser.getText();
      return { text: result.text, pageCount: result.total };
    } finally {
      await parser.destroy();
    }
  }

  throw new Error(`unsupported mime type for extraction: ${mimeType}`);
}

export const SUPPORTED_SOURCE_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
] as const;
