import type { LetterheadPreset, TypographyPreset } from "@/features/documents/branding-contracts";
import type { VisualProfile } from "@/features/documents/contracts";
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

export interface VisualProfileLayout {
  profile: VisualProfile;
  headerComposition: "professional" | "minimal" | "editorial" | "institutional";
  headerAlignment: "left" | "center";
  logoAlignment: "left" | "center";
  logoMaxHeightPt: number;
  titleAlignment: "left" | "center";
  titleSizePt: number;
  titleTrackingEm: number;
  divider: "none" | "subtle" | "hairline" | "strong";
  dividerWidth: "full" | "short";
  bodyMaxWidthRatio: number;
  bodySizePt: number;
  bodyLineHeightPt: number;
  signatureAlignment: "left" | "center" | "right";
  footerStyle: "minimal" | "compact" | "elegant" | "institutional";
  margins: LetterheadMargins;
}

export const VISUAL_PROFILE_LAYOUTS: Record<VisualProfile, VisualProfileLayout> = {
  clinica: {
    profile: "clinica",
    headerComposition: "professional",
    headerAlignment: "left",
    logoAlignment: "left",
    logoMaxHeightPt: 54,
    titleAlignment: "left",
    titleSizePt: 13,
    titleTrackingEm: 0.08,
    divider: "subtle",
    dividerWidth: "full",
    bodyMaxWidthRatio: 1,
    bodySizePt: 11,
    bodyLineHeightPt: 16,
    signatureAlignment: "right",
    footerStyle: "compact",
    margins: { top: 58, bottom: 64, left: 54, right: 54, header: 78, footer: 48 },
  },
  essencial: {
    profile: "essencial",
    headerComposition: "minimal",
    headerAlignment: "left",
    logoAlignment: "left",
    logoMaxHeightPt: 34,
    titleAlignment: "left",
    titleSizePt: 11.5,
    titleTrackingEm: 0.02,
    divider: "none",
    dividerWidth: "full",
    bodyMaxWidthRatio: 0.94,
    bodySizePt: 10.8,
    bodyLineHeightPt: 17,
    signatureAlignment: "left",
    footerStyle: "minimal",
    margins: { top: 74, bottom: 70, left: 70, right: 70, header: 54, footer: 36 },
  },
  premium: {
    profile: "premium",
    headerComposition: "editorial",
    headerAlignment: "center",
    logoAlignment: "center",
    logoMaxHeightPt: 60,
    titleAlignment: "center",
    titleSizePt: 14,
    titleTrackingEm: 0.14,
    divider: "hairline",
    dividerWidth: "short",
    bodyMaxWidthRatio: 0.84,
    bodySizePt: 11,
    bodyLineHeightPt: 17,
    signatureAlignment: "center",
    footerStyle: "elegant",
    margins: { top: 76, bottom: 68, left: 72, right: 72, header: 104, footer: 44 },
  },
  institucional: {
    profile: "institucional",
    headerComposition: "institutional",
    headerAlignment: "left",
    logoAlignment: "left",
    logoMaxHeightPt: 62,
    titleAlignment: "left",
    titleSizePt: 14,
    titleTrackingEm: 0.04,
    divider: "strong",
    dividerWidth: "full",
    bodyMaxWidthRatio: 1,
    bodySizePt: 10.7,
    bodyLineHeightPt: 15,
    signatureAlignment: "left",
    footerStyle: "institutional",
    margins: { top: 52, bottom: 66, left: 50, right: 50, header: 92, footer: 56 },
  },
};

export function getVisualProfileLayout(profile: VisualProfile): VisualProfileLayout {
  return VISUAL_PROFILE_LAYOUTS[profile];
}

export function profileFromLetterhead(letterhead: LetterheadPreset): VisualProfile {
  if (letterhead === "minimalista") return "essencial";
  if (letterhead === "premium" || letterhead === "profissional") return "premium";
  if (letterhead === "institucional") return "institucional";
  return "clinica";
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
  if (layout === "livreto") {
    return { top: 76, bottom: 68, left: 72, right: 72, header: 104, footer: 48 };
  }
  return getVisualProfileLayout(profileFromLetterhead(letterhead)).margins;
}

export function letterheadDividerThickness(letterhead: LetterheadPreset): number {
  const divider = getVisualProfileLayout(profileFromLetterhead(letterhead)).divider;
  if (divider === "none") return 0;
  if (divider === "hairline") return 0.45;
  if (divider === "strong") return 1.35;
  return 0.8;
}

export function buildLetterheadHeaderLines(branding: ResolvedBranding): LetterheadHeaderLine[] {
  const layout = getVisualProfileLayout(branding.visualProfile);
  const lines: LetterheadHeaderLine[] = [];

  if (layout.headerComposition === "minimal") {
    if (branding.header.professional && branding.professionalName.trim()) {
      const compact = [branding.professionalName.trim(), branding.header.crp ? branding.crpLabel.trim() : ""]
        .filter(Boolean)
        .join(" · ");
      lines.push({ text: compact, weight: "regular", size: 9.5 });
    } else if (branding.header.clinic && branding.clinicName.trim()) {
      lines.push({ text: branding.clinicName.trim(), weight: "regular", size: 9.5 });
    }
    return lines;
  }

  if (layout.headerComposition === "editorial") {
    if (branding.header.clinic && branding.clinicName.trim()) {
      lines.push({ text: branding.clinicName.trim(), weight: "regular", size: 8.5 });
    }
    if (branding.header.professional && branding.professionalName.trim()) {
      lines.push({ text: branding.professionalName.trim(), weight: "bold", size: 13 });
    }
    if (branding.header.professional && branding.professionalTitle.trim()) {
      lines.push({ text: branding.professionalTitle.trim(), weight: "regular", size: 9 });
    }
    if (branding.header.crp && branding.crpLabel.trim()) {
      lines.push({ text: branding.crpLabel.trim(), weight: "regular", size: 8.5 });
    }
    return lines;
  }

  if (layout.headerComposition === "institutional") {
    if (branding.header.clinic && branding.clinicName.trim()) {
      lines.push({ text: branding.clinicName.trim(), weight: "bold", size: 13.5 });
    }
    if (branding.header.professional && branding.professionalName.trim()) {
      lines.push({ text: branding.professionalName.trim(), weight: "bold", size: 10 });
    }
    const professionalMeta = [
      branding.header.professional ? branding.professionalTitle.trim() : "",
      branding.header.crp ? branding.crpLabel.trim() : "",
    ].filter(Boolean).join(" · ");
    if (professionalMeta) lines.push({ text: professionalMeta, weight: "regular", size: 8.5 });
  } else {
    if (branding.header.clinic && branding.clinicName.trim()) {
      lines.push({ text: branding.clinicName.trim(), weight: "regular", size: 9 });
    }
    if (branding.header.professional && branding.professionalName.trim()) {
      lines.push({ text: branding.professionalName.trim(), weight: "bold", size: 11.5 });
    }
    if (branding.header.professional && branding.professionalTitle.trim()) {
      lines.push({ text: branding.professionalTitle.trim(), weight: "regular", size: 9 });
    }
    if (branding.header.crp && branding.crpLabel.trim()) {
      lines.push({ text: branding.crpLabel.trim(), weight: "regular", size: 8.5 });
    }
  }

  if (branding.qualifications.trim() && layout.headerComposition !== "institutional") {
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
  const layout = getVisualProfileLayout(branding.visualProfile);
  const identity: string[] = [];
  const professionalBits: string[] = [];
  const contact: string[] = [];

  if (branding.footer.clinic && branding.clinicName.trim()) identity.push(branding.clinicName.trim());
  if (branding.cityState.trim() && branding.footer.address) identity.push(branding.cityState.trim());
  if (branding.footer.professional && branding.professionalName.trim()) professionalBits.push(branding.professionalName.trim());
  if (branding.footer.professional && branding.professionalTitle.trim()) professionalBits.push(branding.professionalTitle.trim());
  if (branding.footer.crp && branding.crpLabel.trim()) professionalBits.push(branding.crpLabel.trim());
  if (branding.footer.phone && branding.phone.trim()) contact.push(branding.phone.trim());
  if (branding.footer.email && branding.email.trim()) contact.push(branding.email.trim());
  if (branding.footer.website && branding.website.trim()) contact.push(branding.website.trim());

  const commercial: string[] = [];
  if (branding.tradeName.trim() && branding.tradeName.trim() !== branding.clinicName.trim()) commercial.push(branding.tradeName.trim());
  if (branding.legalName.trim()) commercial.push(branding.legalName.trim());
  if (branding.taxId.trim()) {
    const tax = branding.taxId.trim();
    commercial.push(/^cnpj/i.test(tax) ? tax : `CNPJ ${tax}`);
  }

  const technical: string[] = [];
  const pageIndex = meta.pageIndex ?? 0;
  const pageCount = meta.pageCount ?? 1;
  if (branding.footer.pageNumbers) technical.push(`Página ${pageIndex + 1} de ${pageCount}`);
  if (branding.footer.documentId && meta.documentId && meta.documentId !== "local") technical.push(`ID ${meta.documentId.slice(0, 8)}`);
  if (branding.footer.version && typeof meta.version === "number") technical.push(`v${meta.version}`);
  if (branding.footer.hash && meta.contentSha256) technical.push(meta.contentSha256.slice(0, 12));

  const lines: string[] = [];
  if (layout.footerStyle === "minimal") {
    if (contact.length > 0) lines.push(contact.join(" · "));
    if (technical.length > 0) lines.push(technical.join(" · "));
  } else if (layout.footerStyle === "elegant") {
    if (professionalBits.length > 0) lines.push(professionalBits.join(" · "));
    if (contact.length > 0) lines.push(contact.join(" · "));
    if (technical.length > 0) lines.push(technical.join(" · "));
  } else if (layout.footerStyle === "institutional") {
    if (identity.length > 0) lines.push(identity.join(" • "));
    if (contact.length > 0) lines.push(contact.join(" · "));
    if (commercial.length > 0) lines.push(commercial.join(" · "));
    if (technical.length > 0) lines.push(technical.join(" · "));
  } else {
    if (contact.length > 0) lines.push(contact.join(" · "));
    if (identity.length > 0) lines.push(identity.join(" • "));
    if (technical.length > 0) lines.push(technical.join(" · "));
  }
  if (meta.footerNote?.trim()) lines.push(meta.footerNote.trim());
  return lines.slice(0, 4);
}
