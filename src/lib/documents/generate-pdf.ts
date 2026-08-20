import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE_WIDTH = 595.28; // A4 in points
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const FONT_SIZE = 11;
const LINE_HEIGHT = 16;
const TITLE_FONT_SIZE = 16;

/**
 * Renders a plain-text document body to a simple, print-ready PDF.
 * Deliberately minimal (no rich formatting) — this project does not use
 * Google Docs/Drive (prompts/09-documents-tcle.md), and a serverless-friendly
 * pure-JS library (no headless-browser/native binary) is what keeps this
 * runnable on Vercel.
 */
export async function generateDocumentPdf(params: {
  title: string;
  body: string;
  footer?: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const maxWidth = PAGE_WIDTH - MARGIN * 2;
  const titleLines = wrapText(params.title, boldFont, TITLE_FONT_SIZE, maxWidth);
  const bodyLines = params.body
    .split("\n")
    .flatMap((paragraph) =>
      paragraph.trim() ? wrapText(paragraph, font, FONT_SIZE, maxWidth) : [""],
    );

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = PAGE_HEIGHT - MARGIN;

  const drawLine = (text: string, useFont: typeof font, size: number) => {
    if (cursorY < MARGIN + LINE_HEIGHT) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      cursorY = PAGE_HEIGHT - MARGIN;
    }
    if (text) {
      page.drawText(text, {
        x: MARGIN,
        y: cursorY,
        size,
        font: useFont,
        color: rgb(0.12, 0.12, 0.12),
      });
    }
    cursorY -= LINE_HEIGHT;
  };

  for (const line of titleLines) {
    drawLine(line, boldFont, TITLE_FONT_SIZE);
  }
  cursorY -= LINE_HEIGHT / 2;

  for (const line of bodyLines) {
    drawLine(line, font, FONT_SIZE);
  }

  if (params.footer) {
    cursorY -= LINE_HEIGHT;
    for (const line of wrapText(params.footer, font, FONT_SIZE - 2, maxWidth)) {
      drawLine(line, font, FONT_SIZE - 2);
    }
  }

  return pdf.save();
}

function wrapText(
  text: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}
