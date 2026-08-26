export interface TextChunk {
  sequence: number;
  text: string;
  charStart: number;
  charEnd: number;
}

export interface ChunkTextOptions {
  chunkSize?: number;
  overlap?: number;
}

/**
 * Fixed-size character chunking with overlap, breaking on the nearest
 * paragraph/sentence boundary within the window when one exists so a chunk
 * doesn't split mid-sentence more than necessary. Deliberately simple
 * (no semantic/embedding-based chunking) — good enough for retrieval over
 * a private, curated library, and easy to reason about/test.
 */
export function chunkText(text: string, options: ChunkTextOptions = {}): TextChunk[] {
  const chunkSize = options.chunkSize ?? 1500;
  const overlap = options.overlap ?? 200;
  const trimmed = text.trim();

  if (!trimmed) {
    return [];
  }
  if (trimmed.length <= chunkSize) {
    return [{ sequence: 0, text: trimmed, charStart: 0, charEnd: trimmed.length }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let sequence = 0;

  while (start < trimmed.length) {
    let end = Math.min(start + chunkSize, trimmed.length);

    if (end < trimmed.length) {
      const windowStart = Math.max(start + Math.floor(chunkSize * 0.6), start);
      const boundary = findBoundary(trimmed, windowStart, end);
      if (boundary !== -1) {
        end = boundary;
      }
    }

    const chunkTextValue = trimmed.slice(start, end).trim();
    if (chunkTextValue) {
      chunks.push({ sequence, text: chunkTextValue, charStart: start, charEnd: end });
      sequence += 1;
    }

    if (end >= trimmed.length) {
      break;
    }
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

function findBoundary(text: string, from: number, to: number): number {
  const window = text.slice(from, to);
  const paragraphBreak = window.lastIndexOf("\n\n");
  if (paragraphBreak !== -1) {
    return from + paragraphBreak + 2;
  }
  const sentenceBreak = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf(".\n"),
  );
  if (sentenceBreak !== -1) {
    return from + sentenceBreak + 2;
  }
  return -1;
}
