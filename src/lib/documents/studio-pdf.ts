import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { DocumentSection, LayoutFormat, LogoAlign, LogoSize } from "@/features/documents/contracts";
import type { ResolvedBranding } from "@/features/documents/branding-resolve";
import {
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  buildLetterheadFooterLines,
  buildLetterheadHeaderLines,
  letterheadDividerThickness,
  letterheadMargins,
  usesSerifTypography,
} from "@/features/documents/branding-layout";
import { defaultBranding, logoMaxHeightPt, resolveBranding } from "@/features/documents/branding-resolve";

export const PAGE_WIDTH = A4_WIDTH_PT;
export const PAGE_HEIGHT = A4_HEIGHT_PT;

export interface StudioCoverSpec {
  documentType: string;
  subjectName?: string | null;
  requester?: string | null;
  purpose?: string | null;
  city?: string | null;
  dateLabel?: string | null;
}

export interface StudioPdfInput {
  title: string;
  documentKindLabel?: string;
  sections: DocumentSection[];
  branding: ResolvedBranding;
  logoBytes?: Uint8Array | null;
  logoMime?: string | null;
  logoAlign?: LogoAlign;
  logoSize?: LogoSize;
  logoCustomMaxPt?: number | null;
  documentId: string;
  version: number;
  contentSha256?: string | null;
  cover?: StudioCoverSpec | null;
  layout: LayoutFormat;
  signatureLines?: string[];
  manualSignatureBlock?: { professionalLines: string[]; clientLines: string[]; extraLines?: string[] };
  footerNote?: string;
  /** Skip letterhead — used by receipts and the legacy textarea path. */
  classicMode?: boolean;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

function hexToRgb(hex: string): ReturnType<typeof rgb> {
  const raw = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
    return rgb(0.23, 0.31, 0.26);
  }
  const n = Number.parseInt(raw, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const normalized = text.replace(/\t/g, " ");
  const words = normalized.split(/\s+/);
  if (words.length === 0 || (words.length === 1 && words[0] === "")) {
    return [""];
  }
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!word) continue;
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
      while (font.widthOfTextAtSize(current, size) > maxWidth && current.length > 1) {
        let cut = current.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(current.slice(0, cut), size) > maxWidth) {
          cut -= 1;
        }
        lines.push(current.slice(0, cut));
        current = current.slice(cut);
      }
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function usesSerif(preset: ResolvedBranding["typography"]): boolean {
  return usesSerifTypography(preset);
}

function margins(layout: LayoutFormat, letterhead: ResolvedBranding["letterhead"], classic: boolean) {
  return letterheadMargins(layout === "livreto" ? "livreto" : "tradicional", letterhead, classic);
}

type Run =
  | { kind: "heading"; level: 1 | 2; text: string }
  | { kind: "paragraph"; text: string; align: "left" | "center" | "right"; bold?: boolean }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; rows: string[][] }
  | { kind: "page-break" }
  | { kind: "spacer" };

function parseInlineAlign(line: string): { align: "left" | "center" | "right"; text: string } {
  if (line.startsWith("::center::")) return { align: "center", text: line.slice(10).trim() };
  if (line.startsWith("::right::")) return { align: "right", text: line.slice(9).trim() };
  return { align: "left", text: line };
}

function parseContent(content: string): Run[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const runs: Run[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let table: string[][] | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const joined = paragraph.join(" ").trim();
    paragraph = [];
    if (!joined) {
      runs.push({ kind: "spacer" });
      return;
    }
    const aligned = parseInlineAlign(joined);
    runs.push({ kind: "paragraph", text: aligned.text, align: aligned.align });
  };
  const flushList = () => {
    if (list && list.items.length > 0) runs.push({ kind: "list", ...list });
    list = null;
  };
  const flushTable = () => {
    if (table && table.length > 0) runs.push({ kind: "table", rows: table });
    table = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (trimmed === "[page-break]" || trimmed === "---page---") {
      flushParagraph();
      flushList();
      flushTable();
      runs.push({ kind: "page-break" });
      continue;
    }
    if (trimmed === "") {
      flushParagraph();
      flushList();
      flushTable();
      continue;
    }
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushParagraph();
      flushList();
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim());
      if (cells.every((cell) => /^[-:]+$/.test(cell))) {
        continue;
      }
      table = table ?? [];
      table.push(cells);
      continue;
    }
    flushTable();
    const headingMatch = trimmed.match(/^(#{1,2})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      runs.push({
        kind: "heading",
        level: headingMatch[1].length === 1 ? 1 : 2,
        text: headingMatch[2],
      });
      continue;
    }
    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(unordered[1]);
      continue;
    }
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1]);
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();
  flushTable();
  return runs;
}

function sectionRuns(section: DocumentSection): Run[] {
  if (!section.enabled) return [];
  const runs: Run[] = [];
  if (section.pageBreakBefore || section.type === "page_break") {
    runs.push({ kind: "page-break" });
  }
  if (section.type === "page_break") {
    return runs;
  }
  if (section.title.trim()) {
    runs.push({ kind: "heading", level: 1, text: section.title.trim() });
  }
  runs.push(...parseContent(section.content));
  return runs;
}

async function embedLogo(
  pdf: PDFDocument,
  bytes: Uint8Array,
  mime: string | null | undefined,
): Promise<PDFImage | null> {
  try {
    const header = bytes.slice(0, 8);
    const isPng =
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      mime !== "image/jpeg";
    const isJpeg = header[0] === 0xff && header[1] === 0xd8;
    if (isJpeg || mime === "image/jpeg") {
      return await pdf.embedJpg(bytes);
    }
    if (isPng || mime === "image/png") {
      return await pdf.embedPng(bytes);
    }
    return null;
  } catch {
    return null;
  }
}

function fitLogo(image: PDFImage, maxH: number, maxW: number): { width: number; height: number } {
  const ratio = image.width / image.height;
  let height = maxH;
  let width = height * ratio;
  if (width > maxW) {
    width = maxW;
    height = width / ratio;
  }
  return { width, height };
}

function footerParts(input: StudioPdfInput, pageIndex: number, pageCount: number): string[] {
  return buildLetterheadFooterLines(input.branding, {
    pageIndex,
    pageCount,
    documentId: input.documentId,
    version: input.version,
    contentSha256: input.contentSha256,
    footerNote: input.footerNote,
  });
}

/**
 * Unique PDF renderer for the Document Studio. Preview and issuance must call
 * this function — never a parallel HTML layout.
 */
export async function generateStudioPdf(input: StudioPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const serif = usesSerif(input.branding.typography);
  const fonts: Fonts = {
    regular: await pdf.embedFont(serif ? StandardFonts.TimesRoman : StandardFonts.Helvetica),
    bold: await pdf.embedFont(serif ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(
      serif ? StandardFonts.TimesRomanItalic : StandardFonts.HelveticaOblique,
    ),
  };
  const box = margins(input.layout, input.branding.letterhead, Boolean(input.classicMode));
  const contentWidth = PAGE_WIDTH - box.left - box.right;
  const primary = hexToRgb(input.branding.colors.primary);
  const headings = hexToRgb(input.branding.colors.headings);
  const dividers = hexToRgb(input.branding.colors.dividers);
  const bodyColor = rgb(0.12, 0.12, 0.12);
  const muted = hexToRgb(input.branding.colors.secondary);

  let logo: PDFImage | null = null;
  if (input.logoBytes && input.branding.header.logo && input.logoMime !== "image/svg+xml") {
    logo = await embedLogo(pdf, input.logoBytes, input.logoMime);
  }

  const bodySize = input.layout === "livreto" ? 11.5 : 11;
  const lineHeight = input.layout === "livreto" ? 17 : 16;
  const headingSize = input.classicMode ? 16 : 13;

  type PageState = { page: PDFPage; y: number; skipHeader: boolean };
  const states: PageState[] = [];

  const headerHeight = (skip: boolean) => {
    if (input.classicMode || skip) return 0;
    return box.header;
  };

  const ensurePage = (forceNew = false, skipHeader = false): PageState => {
    const last = states[states.length - 1];
    if (!forceNew && last && last.y > box.bottom + lineHeight * 2) {
      return last;
    }
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const y = PAGE_HEIGHT - box.top - headerHeight(skipHeader);
    const state = { page, y, skipHeader };
    states.push(state);
    return state;
  };

  const beginContentPage = (): PageState => {
    const next = ensurePage(true, false);
    if (!input.classicMode) {
      drawHeader(next);
      next.y = PAGE_HEIGHT - box.top - box.header - 8;
    }
    return next;
  };

  const needSpace = (state: PageState, height: number) => {
    if (state.y - height < box.bottom + 8) {
      return beginContentPage();
    }
    return state;
  };

  const drawHeader = (state: PageState) => {
    if (input.classicMode || state.skipHeader) return;
    const page = state.page;
    const maxH = logoMaxHeightPt(input.logoSize ?? "medium", input.logoCustomMaxPt);
    let cursorY = PAGE_HEIGHT - box.top;
    const align = input.logoAlign ?? "left";

    if (logo && input.branding.header.logo) {
      const fitted = fitLogo(logo, maxH, Math.min(220, contentWidth * 0.45));
      let x = box.left;
      if (align === "center") x = (PAGE_WIDTH - fitted.width) / 2;
      if (align === "right") x = PAGE_WIDTH - box.right - fitted.width;
      page.drawImage(logo, {
        x,
        y: cursorY - fitted.height,
        width: fitted.width,
        height: fitted.height,
      });
      if (align === "left") {
        // text column to the right of the logo
      }
      cursorY -= fitted.height + 8;
    }

    const letterhead = input.branding.letterhead;
    const headerLines = buildLetterheadHeaderLines(input.branding).map((line) => ({
      text: line.text,
      font: line.weight === "bold" ? fonts.bold : fonts.regular,
      size: line.size,
    }));

    let textX = box.left;
    if (logo && (input.logoAlign ?? "left") === "left" && input.branding.header.logo) {
      const fitted = fitLogo(logo, maxH, Math.min(220, contentWidth * 0.45));
      textX = box.left + fitted.width + 12;
    }
    let textY = PAGE_HEIGHT - box.top - (logo && (input.logoAlign ?? "left") === "left" ? 4 : 0);
    if (logo && (input.logoAlign ?? "left") !== "left") {
      textY = cursorY;
    }
    for (const line of headerLines) {
      const width = line.font.widthOfTextAtSize(line.text, line.size);
      let x = textX;
      if ((input.logoAlign ?? "left") === "center") {
        x = (PAGE_WIDTH - width) / 2;
      }
      page.drawText(line.text, {
        x,
        y: textY - line.size,
        size: line.size,
        font: line.font,
        color: headings,
      });
      textY -= line.size + 3;
    }

    const dividerY = Math.min(textY, cursorY) - 6;
    page.drawLine({
      start: { x: box.left, y: dividerY },
      end: { x: PAGE_WIDTH - box.right, y: dividerY },
      thickness: letterheadDividerThickness(letterhead),
      color: dividers,
    });
  };

  const drawCover = () => {
    const state = ensurePage(true, true);
    const page = state.page;
    let y = PAGE_HEIGHT - 120;
    if (logo) {
      const fitted = fitLogo(logo, 72, 240);
      page.drawImage(logo, {
        x: (PAGE_WIDTH - fitted.width) / 2,
        y: y - fitted.height,
        width: fitted.width,
        height: fitted.height,
      });
      y -= fitted.height + 28;
    }
    const cover = input.cover!;
    const center = (text: string, font: PDFFont, size: number, color = headings) => {
      const width = font.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: (PAGE_WIDTH - width) / 2,
        y,
        size,
        font,
        color,
      });
      y -= size + 10;
    };
    if (input.branding.clinicName) {
      center(input.branding.clinicName, fonts.bold, 16);
    }
    center("Psicologia", fonts.italic, 12, muted);
    y -= 12;
    center(cover.documentType.toUpperCase(), fonts.bold, 14, primary);
    y -= 18;
    if (cover.subjectName) center(cover.subjectName, fonts.regular, 12);
    if (cover.requester) center(`Solicitante: ${cover.requester}`, fonts.regular, 10, muted);
    if (cover.purpose) {
      for (const line of wrapText(cover.purpose, fonts.regular, 10, contentWidth * 0.8)) {
        center(line, fonts.regular, 10, muted);
      }
    }
    y -= 24;
    if (input.branding.professionalName) {
      center(input.branding.professionalName, fonts.bold, 11);
    }
    if (input.branding.crpLabel) center(input.branding.crpLabel, fonts.regular, 10);
    y -= 8;
    if (cover.city || cover.dateLabel) {
      center([cover.city, cover.dateLabel].filter(Boolean).join(", "), fonts.regular, 10, muted);
    }
    state.y = box.bottom;
  };

  const bookletOpening = input.layout === "livreto" && !input.classicMode;
  if (input.cover && !input.classicMode && !bookletOpening) {
    drawCover();
  }

  if (bookletOpening) {
    const state = ensurePage(true, true);
    const page = state.page;
    let y = PAGE_HEIGHT - 140;
    if (logo) {
      const fitted = fitLogo(logo, 64, 200);
      page.drawImage(logo, {
        x: (PAGE_WIDTH - fitted.width) / 2,
        y: y - fitted.height,
        width: fitted.width,
        height: fitted.height,
      });
      y -= fitted.height + 24;
    }
    const center = (text: string, font: PDFFont, size: number) => {
      const width = font.widthOfTextAtSize(text, size);
      page.drawText(text, { x: (PAGE_WIDTH - width) / 2, y, size, font, color: headings });
      y -= size + 8;
    };
    if (input.branding.clinicName) center(input.branding.clinicName, fonts.bold, 18);
    center("Psicologia", fonts.italic, 12);
    y -= 10;
    if (input.branding.professionalName) center(input.branding.professionalName, fonts.bold, 13);
    if (input.branding.crpLabel) center(input.branding.crpLabel, fonts.regular, 11);
    y -= 16;
    const details = [
      input.branding.addressLine,
      input.branding.cityState,
      input.branding.phone,
      input.branding.email,
      input.branding.website,
    ].filter(Boolean);
    for (const line of details) {
      center(line, fonts.regular, 10);
    }
    state.y = box.bottom;
  }

  let state = beginContentPage();

  if (input.classicMode) {
    for (const line of wrapText(input.title, fonts.bold, headingSize, contentWidth)) {
      state = needSpace(state, lineHeight + 4);
      state.page.drawText(line, {
        x: box.left,
        y: state.y,
        size: headingSize,
        font: fonts.bold,
        color: bodyColor,
      });
      state.y -= lineHeight + 2;
    }
    state.y -= 8;
  } else if (input.title) {
    state = needSpace(state, 28);
    state.page.drawText(input.title, {
      x: box.left,
      y: state.y,
      size: 14,
      font: fonts.bold,
      color: primary,
    });
    state.y -= 20;
    state.page.drawLine({
      start: { x: box.left, y: state.y },
      end: { x: PAGE_WIDTH - box.right, y: state.y },
      thickness: 0.8,
      color: dividers,
    });
    state.y -= 16;
  }

  const drawParagraph = (
    text: string,
    opts: { font?: PDFFont; size?: number; align?: "left" | "center" | "right"; color?: ReturnType<typeof rgb> },
  ) => {
    const font = opts.font ?? fonts.regular;
    const size = opts.size ?? bodySize;
    const align = opts.align ?? "left";
    const color = opts.color ?? bodyColor;
    const lines = wrapText(text, font, size, contentWidth);
    for (const line of lines) {
      state = needSpace(state, lineHeight);
      const width = font.widthOfTextAtSize(line, size);
      let x = box.left;
      if (align === "center") x = box.left + (contentWidth - width) / 2;
      if (align === "right") x = PAGE_WIDTH - box.right - width;
      state.page.drawText(line, { x, y: state.y, size, font, color });
      state.y -= lineHeight;
    }
  };

  const runs: Run[] = [];
  const enabled = [...input.sections].filter((section) => section.enabled).sort((a, b) => a.order - b.order);
  for (const section of enabled) {
    runs.push(...sectionRuns(section));
  }

  for (const run of runs) {
    if (run.kind === "page-break") {
      state = beginContentPage();
      continue;
    }
    if (run.kind === "spacer") {
      state.y -= lineHeight * 0.6;
      continue;
    }
    if (run.kind === "heading") {
      const size = run.level === 1 ? 12.5 : 11;
      const block = size + lineHeight * 2;
      if (state.y - block < box.bottom + 8) {
        state = beginContentPage();
      }
      state.y -= 6;
      drawParagraph(run.text, {
        font: fonts.bold,
        size,
        color: headings,
      });
      state.y -= 4;
      continue;
    }
    if (run.kind === "paragraph") {
      drawParagraph(run.text, { align: run.align, font: run.bold ? fonts.bold : fonts.regular });
      state.y -= 4;
      continue;
    }
    if (run.kind === "list") {
      run.items.forEach((item, index) => {
        const bullet = run.ordered ? `${index + 1}. ` : "• ";
        const lines = wrapText(item, fonts.regular, bodySize, contentWidth - 18);
        lines.forEach((line, lineIndex) => {
          state = needSpace(state, lineHeight);
          const prefix = lineIndex === 0 ? bullet : "   ";
          state.page.drawText(`${prefix}${line}`, {
            x: box.left + 6,
            y: state.y,
            size: bodySize,
            font: fonts.regular,
            color: bodyColor,
          });
          state.y -= lineHeight;
        });
      });
      state.y -= 4;
      continue;
    }
    if (run.kind === "table") {
      const cols = Math.max(...run.rows.map((row) => row.length), 1);
      const colW = contentWidth / cols;
      const rowH = lineHeight + 6;
      for (const row of run.rows) {
        state = needSpace(state, rowH);
        for (let i = 0; i < cols; i += 1) {
          const cell = row[i] ?? "";
          state.page.drawRectangle({
            x: box.left + i * colW,
            y: state.y - 4,
            width: colW,
            height: rowH,
            borderColor: dividers,
            borderWidth: 0.4,
          });
          const cellLines = wrapText(cell, fonts.regular, 9, colW - 8);
          state.page.drawText(cellLines[0] ?? "", {
            x: box.left + i * colW + 4,
            y: state.y + 4,
            size: 9,
            font: fonts.regular,
            color: bodyColor,
          });
        }
        state.y -= rowH;
      }
      state.y -= 6;
    }
  }

  if (input.signatureLines && input.signatureLines.length > 0) {
    state.y -= 12;
    for (const line of input.signatureLines) {
      drawParagraph(line, { font: fonts.regular, size: 9, color: muted });
    }
  }

  if (input.manualSignatureBlock) {
    if (state.y < box.bottom + 140) {
      state = beginContentPage();
    }
    state.y -= 24;
    const colW = (contentWidth - 24) / 2;
    const drawSig = (x: number, lines: string[]) => {
      state.page.drawLine({
        start: { x, y: state.y },
        end: { x: x + colW, y: state.y },
        thickness: 0.6,
        color: muted,
      });
      let y = state.y - 14;
      for (const line of lines) {
        state.page.drawText(line, {
          x,
          y,
          size: 9,
          font: fonts.regular,
          color: bodyColor,
        });
        y -= 12;
      }
    };
    drawSig(box.left, input.manualSignatureBlock.professionalLines);
    drawSig(box.left + colW + 24, input.manualSignatureBlock.clientLines);
    state.y -= 70;
    if (input.manualSignatureBlock.extraLines) {
      for (const line of input.manualSignatureBlock.extraLines) {
        drawParagraph(line, { size: 9, color: muted });
      }
    }
  }

  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    const skip = states[index]?.skipHeader;
    if (!input.classicMode && !skip) {
      // headers already drawn during layout
    }
    const parts = footerParts(input, index, pages.length);
    let fy = box.bottom - 6;
    page.drawLine({
      start: { x: box.left, y: box.bottom + 10 },
      end: { x: PAGE_WIDTH - box.right, y: box.bottom + 10 },
      thickness: 0.4,
      color: dividers,
    });
    for (const part of parts.reverse()) {
      const size = 8;
      const width = fonts.regular.widthOfTextAtSize(part, size);
      page.drawText(part, {
        x: (PAGE_WIDTH - width) / 2,
        y: fy,
        size,
        font: fonts.regular,
        color: muted,
      });
      fy += 10;
    }
  });

  return pdf.save();
}

export async function generateDocumentPdf(params: {
  title: string;
  body: string;
  footer?: string;
  signatureBlock?: string[];
}): Promise<Uint8Array> {
  return generateStudioPdf({
    title: params.title,
    sections: [
      {
        id: "body",
        type: "text",
        title: "",
        content: params.body,
        order: 0,
        enabled: true,
        pageBreakBefore: false,
      },
    ],
    branding: resolveBranding(defaultBranding()),
    documentId: "local",
    version: 1,
    layout: "tradicional",
    signatureLines: params.signatureBlock,
    footerNote: params.footer,
    classicMode: true,
  });
}
