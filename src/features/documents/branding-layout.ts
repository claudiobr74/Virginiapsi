import type { LetterheadPreset, TypographyPreset } from "@/features/documents/branding-contracts";
import type { ResolvedBranding } from "@/features/documents/branding-resolve";

/** ISO 216 A4 in PDF points (1/72 in). Shared by HTML preview and PDF renderer. */
export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;

export interface LetterheadMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
  header: number;
  footer: number;
}

export interface LetterheadHeaderLine {
  text: string;
  weight: "regular" | "bold";
  size: number;
}

export function usesSerifTypography(preset: TypographyPreset): boolean {
  return preset === "classica" || preset === "editorial";
}

export function brandingFontFamily(preset: TypographyPreset): { heading: string; body: string } {
  if (preset === "classica" || preset === "editorial") {
    return {
      heading: 'Georgia, "Times New Roman", serif',
      body: 'Georgia, "Times New Roman", serif',
    };
  }
  if (preset === "institucional") {
    return {
      heading: 'Georgia, "Times New Roman", serif',
      body: 'system-ui, "Segoe UI", sans-serif',
    };
  }
  return {
    heading: 'system-ui, "Segoe UI", sans-serif',
    body: 'system-ui, "Segoe UI", sans-serif',
  };
}

export function letterheadMargins(
  layout: "tradicional" | "livreto",
  letterhead: LetterheadPreset,
  classic: boolean,
): LetterheadMargins {
  if (classic) {
    return { top: 56, bottom: 56, left: 56, right: 56, header: 0, footer: 42 };
  }
  const premium = letterhead === "premium" || layout === "livreto";
  return {
    top: premium ? 72 : 58,
    bottom: 64,
    left: premium ? 64 : 54,
    right: premium ? 64 : 54,
    header: layout === "livreto" ? 96 : 78,
    footer: 48,
  };
}

export function letterheadDividerThickness(letterhead: LetterheadPreset): number {
  return letterhead === "minimalista" ? 0.6 : 1;
}

export function buildLetterheadHeaderLines(branding: ResolvedBranding): LetterheadHeaderLine[] {
  const letterhead = branding.letterhead;
  const lines: LetterheadHeaderLine[] = [];
  if (branding.header.clinic && branding.clinicName.trim()) {
    lines.push({
      text: branding.clinicName.trim(),
      weight: "bold",
      size: letterhead === "institucional" ? 13 : 11,
    });
  }
  if (branding.header.professional && branding.professionalName.trim()) {
    const prominent = letterhead === "profissional" || letterhead === "premium";
    lines.push({
      text: branding.professionalName.trim(),
      weight: prominent ? "bold" : "regular",
      size: prominent ? 12 : 10,
    });
  }
  if (branding.header.professional && branding.professionalTitle.trim()) {
    lines.push({
      text: branding.professionalTitle.trim(),
      weight: "regular",
      size: 9,
    });
  }
  if (branding.header.crp && branding.crpLabel.trim()) {
    lines.push({ text: branding.crpLabel.trim(), weight: "regular", size: 9 });
  }
  if (branding.qualifications.trim()) {
    lines.push({ text: branding.qualifications.trim(), weight: "regular", size: 8 });
  }
  const contact: string[] = [];
  if (branding.header.phone && branding.phone.trim()) contact.push(branding.phone.trim());
  if (branding.header.email && branding.email.trim()) contact.push(branding.email.trim());
  if (branding.header.website && branding.website.trim()) contact.push(branding.website.trim());
  if (branding.header.address && (branding.addressLine.trim() || branding.cityState.trim())) {
    contact.push([branding.addressLine, branding.cityState].filter((part) => part.trim()).join(" — "));
  }
  if (contact.length > 0) {
    lines.push({ text: contact.join("  ·  "), weight: "regular", size: 8 });
  }
  return lines;
}

export function buildLetterheadFooterLines(
  branding: ResolvedBranding,
  meta: {
    pageIndex?: number;
    pageCount?: number;
    documentId?: string;
    version?: number;
    contentSha256?: string | null;
    footerNote?: string;
  } = {},
): string[] {
  const identity: string[] = [];
  if (branding.footer.clinic && branding.clinicName.trim()) identity.push(branding.clinicName.trim());
  if (branding.cityState.trim() && branding.footer.address) identity.push(branding.cityState.trim());
  const professionalBits: string[] = [];
  if (branding.footer.professional && branding.professionalName.trim()) {
    professionalBits.push(branding.professionalName.trim());
  }
  if (branding.footer.professional && branding.professionalTitle.trim()) {
    professionalBits.push(branding.professionalTitle.trim());
  }
  if (branding.footer.crp && branding.crpLabel.trim()) professionalBits.push(branding.crpLabel.trim());
  const contact: string[] = [];
  if (branding.footer.phone && branding.phone.trim()) contact.push(branding.phone.trim());
  if (branding.footer.email && branding.email.trim()) contact.push(branding.email.trim());
  if (branding.footer.website && branding.website.trim()) contact.push(branding.website.trim());
  const lines: string[] = [];
  if (identity.length > 0) lines.push(identity.join(" • "));
  if (professionalBits.length > 0) lines.push(professionalBits.join(" • "));
  if (contact.length > 0) lines.push(contact.join("  ·  "));
  const commercial: string[] = [];
  if (branding.tradeName.trim() && branding.tradeName.trim() !== branding.clinicName.trim()) {
    commercial.push(branding.tradeName.trim());
  }
  if (branding.legalName.trim()) commercial.push(branding.legalName.trim());
  if (branding.taxId.trim()) {
    const tax = branding.taxId.trim();
    commercial.push(/^cnpj/i.test(tax) ? tax : `CNPJ ${tax}`);
  }
  if (commercial.length > 0) lines.push(commercial.join("  ·  "));
  const pageIndex = meta.pageIndex ?? 0;
  const pageCount = meta.pageCount ?? 1;
  const technical: string[] = [];
  if (branding.footer.pageNumbers) technical.push(`Página ${pageIndex + 1} de ${pageCount}`);
  if (branding.footer.documentId && meta.documentId && meta.documentId !== "local") {
    technical.push(`ID ${meta.documentId.slice(0, 8)}`);
  }
  if (branding.footer.version && typeof meta.version === "number") {
    technical.push(`v${meta.version}`);
  }
  if (branding.footer.hash && meta.contentSha256) {
    technical.push(meta.contentSha256.slice(0, 12));
  }
  if (technical.length > 0) lines.push(technical.join("  ·  "));
  if (meta.footerNote?.trim()) lines.push(meta.footerNote.trim());
  return lines.slice(0, 4);
}
