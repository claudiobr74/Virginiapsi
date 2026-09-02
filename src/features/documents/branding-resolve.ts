import type { DocumentKind, VisualProfile } from "@/features/documents/contracts";
import type {
  DocumentBrandingRow,
  LetterheadPreset,
  TypographyPreset,
} from "@/features/documents/branding-contracts";

export const RECOMMENDED_BRANDING_VISIBILITY = {
  show_clinic_name: true,
  show_trade_name: false,
  show_legal_name: false,
  show_address: false,
  show_city: true,
  show_phone: true,
  show_email: true,
  show_website: false,
  show_tax_id: false,
  header_logo: true,
  header_clinic: true,
  header_professional: true,
  header_crp: true,
  header_phone: false,
  header_email: false,
  header_address: false,
  header_website: false,
  footer_clinic: false,
  footer_professional: false,
  footer_crp: false,
  footer_phone: true,
  footer_email: true,
  footer_address: true,
  footer_website: false,
  footer_page_numbers: true,
  footer_document_id: false,
  footer_version: false,
  footer_hash: false,
} as const;

export interface ResolvedBranding {
  clinicName: string;
  professionalName: string;
  professionalTitle: string;
  crpLabel: string;
  qualifications: string;
  tradeName: string;
  legalName: string;
  taxId: string;
  addressLine: string;
  cityState: string;
  phone: string;
  email: string;
  website: string;
  header: {
    logo: boolean;
    clinic: boolean;
    professional: boolean;
    crp: boolean;
    phone: boolean;
    email: boolean;
    address: boolean;
    website: boolean;
  };
  footer: {
    clinic: boolean;
    professional: boolean;
    crp: boolean;
    phone: boolean;
    email: boolean;
    address: boolean;
    website: boolean;
    pageNumbers: boolean;
    documentId: boolean;
    version: boolean;
    hash: boolean;
  };
  colors: {
    primary: string;
    secondary: string;
    headings: string;
    dividers: string;
  };
  typography: TypographyPreset;
  letterhead: LetterheadPreset;
  cancellationNoticeHours: number;
  includeAiInformativeClause: boolean;
}

const DEFAULT_CATEGORY_PROFILE: Partial<Record<DocumentKind, VisualProfile>> = {
  declaracao: "essencial",
  encaminhamento: "clinica",
  relatorio: "clinica",
  laudo: "premium",
  parecer: "premium",
  contrato: "institucional",
  atestado: "clinica",
  autorizacao: "institucional",
  requerimento: "essencial",
  protocolo: "essencial",
};

export function defaultBranding(): DocumentBrandingRow {
  return toDocumentBrandingRow({});
}

export function toDocumentBrandingRow(
  row: Partial<DocumentBrandingRow> & { organization_id?: string },
): DocumentBrandingRow {
  return {
    organization_id: row.organization_id ?? "00000000-0000-0000-0000-000000000000",
    clinic_name: row.clinic_name ?? null,
    trade_name: row.trade_name ?? null,
    legal_name: row.legal_name ?? null,
    address_line: row.address_line ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    postal_code: row.postal_code ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    website: row.website ?? null,
    tax_id: row.tax_id ?? null,
    professional_name: row.professional_name ?? null,
    crp: row.crp ?? null,
    crp_state: row.crp_state ?? null,
    professional_title: row.professional_title ?? null,
    qualifications: row.qualifications ?? null,
    professional_phone: row.professional_phone ?? null,
    professional_email: row.professional_email ?? null,
    show_clinic_name: row.show_clinic_name ?? RECOMMENDED_BRANDING_VISIBILITY.show_clinic_name,
    show_trade_name: row.show_trade_name ?? RECOMMENDED_BRANDING_VISIBILITY.show_trade_name,
    show_legal_name: row.show_legal_name ?? RECOMMENDED_BRANDING_VISIBILITY.show_legal_name,
    show_address: row.show_address ?? RECOMMENDED_BRANDING_VISIBILITY.show_address,
    show_city: row.show_city ?? RECOMMENDED_BRANDING_VISIBILITY.show_city,
    show_phone: row.show_phone ?? RECOMMENDED_BRANDING_VISIBILITY.show_phone,
    show_email: row.show_email ?? RECOMMENDED_BRANDING_VISIBILITY.show_email,
    show_website: row.show_website ?? RECOMMENDED_BRANDING_VISIBILITY.show_website,
    show_tax_id: row.show_tax_id ?? RECOMMENDED_BRANDING_VISIBILITY.show_tax_id,
    header_logo: row.header_logo ?? RECOMMENDED_BRANDING_VISIBILITY.header_logo,
    header_clinic: row.header_clinic ?? RECOMMENDED_BRANDING_VISIBILITY.header_clinic,
    header_professional: row.header_professional ?? RECOMMENDED_BRANDING_VISIBILITY.header_professional,
    header_crp: row.header_crp ?? RECOMMENDED_BRANDING_VISIBILITY.header_crp,
    header_phone: row.header_phone ?? RECOMMENDED_BRANDING_VISIBILITY.header_phone,
    header_email: row.header_email ?? RECOMMENDED_BRANDING_VISIBILITY.header_email,
    header_address: row.header_address ?? RECOMMENDED_BRANDING_VISIBILITY.header_address,
    header_website: row.header_website ?? RECOMMENDED_BRANDING_VISIBILITY.header_website,
    footer_clinic: row.footer_clinic ?? RECOMMENDED_BRANDING_VISIBILITY.footer_clinic,
    footer_professional: row.footer_professional ?? RECOMMENDED_BRANDING_VISIBILITY.footer_professional,
    footer_crp: row.footer_crp ?? RECOMMENDED_BRANDING_VISIBILITY.footer_crp,
    footer_phone: row.footer_phone ?? RECOMMENDED_BRANDING_VISIBILITY.footer_phone,
    footer_email: row.footer_email ?? RECOMMENDED_BRANDING_VISIBILITY.footer_email,
    footer_address: row.footer_address ?? RECOMMENDED_BRANDING_VISIBILITY.footer_address,
    footer_website: row.footer_website ?? RECOMMENDED_BRANDING_VISIBILITY.footer_website,
    footer_page_numbers: row.footer_page_numbers ?? RECOMMENDED_BRANDING_VISIBILITY.footer_page_numbers,
    footer_document_id: row.footer_document_id ?? RECOMMENDED_BRANDING_VISIBILITY.footer_document_id,
    footer_version: row.footer_version ?? RECOMMENDED_BRANDING_VISIBILITY.footer_version,
    footer_hash: row.footer_hash ?? RECOMMENDED_BRANDING_VISIBILITY.footer_hash,
    color_primary: row.color_primary ?? "#3a4f43",
    color_secondary: row.color_secondary ?? "#8a8f8a",
    color_headings: row.color_headings ?? "#171816",
    color_dividers: row.color_dividers ?? "#c5d0c6",
    typography_preset: row.typography_preset ?? "classica",
    letterhead_preset: row.letterhead_preset ?? "clinico",
    default_visual_profile: row.default_visual_profile ?? "clinica",
    category_profile_map: row.category_profile_map ?? {},
    default_logo_id: row.default_logo_id ?? null,
    cancellation_notice_hours: row.cancellation_notice_hours ?? 24,
    adjustment_cadence: row.adjustment_cadence ?? "anual",
    include_ai_informative_clause: row.include_ai_informative_clause ?? false,
  };
}

export function profileLetterhead(profile: VisualProfile): LetterheadPreset {
  if (profile === "essencial") return "minimalista";
  if (profile === "institucional") return "institucional";
  if (profile === "premium") return "premium";
  return "clinico";
}

export function resolveLetterheadForDocument(
  branding: Pick<DocumentBrandingRow, "default_visual_profile" | "letterhead_preset">,
  visualProfile?: VisualProfile,
): LetterheadPreset {
  const orgCustom = branding.letterhead_preset !== profileLetterhead(branding.default_visual_profile);
  if (!visualProfile) return branding.letterhead_preset;
  if (orgCustom && visualProfile === branding.default_visual_profile) {
    return branding.letterhead_preset;
  }
  return profileLetterhead(visualProfile);
}

export function recommendedProfileForKind(kind: DocumentKind): VisualProfile {
  return DEFAULT_CATEGORY_PROFILE[kind] ?? "clinica";
}

export function resolveCreatedDocumentVisualProfile(
  branding: Pick<DocumentBrandingRow, "default_visual_profile"> | null | undefined,
  templateProfile: VisualProfile,
): VisualProfile {
  return branding?.default_visual_profile ?? templateProfile;
}

export function resolveBranding(
  row: DocumentBrandingRow | null | undefined,
  fallback: {
    organizationName?: string | null;
    professionalName?: string | null;
    professionalTitle?: string | null;
    crp?: string | null;
    crpState?: string | null;
    clinicName?: string | null;
    phone?: string | null;
    email?: string | null;
    legalName?: string | null;
    taxId?: string | null;
  } = {},
  visualProfile?: VisualProfile,
): ResolvedBranding {
  const branding = toDocumentBrandingRow(row ?? {});
  const clinic =
    (branding.show_clinic_name ? branding.clinic_name : null) ||
    fallback.clinicName ||
    fallback.organizationName ||
    "";
  const professional =
    branding.professional_name || fallback.professionalName || "";
  const crp = branding.crp || fallback.crp || "";
  const crpState = branding.crp_state || fallback.crpState || "";
  const crpLabel = [crp, crpState].filter(Boolean).join("/");
  const cityState = [branding.city, branding.state].filter(Boolean).join("/");
  const letterhead = resolveLetterheadForDocument(branding, visualProfile);
  const tradeName = branding.show_trade_name ? branding.trade_name?.trim() || "" : "";
  const legalName = branding.show_legal_name
    ? branding.legal_name?.trim() || fallback.legalName?.trim() || ""
    : "";
  const taxId = branding.show_tax_id
    ? branding.tax_id?.trim() || fallback.taxId?.trim() || ""
    : "";

  return {
    clinicName: clinic,
    professionalName: professional,
    professionalTitle: branding.professional_title || fallback.professionalTitle || "Psicóloga",
    crpLabel: crpLabel ? `CRP ${crpLabel}` : "",
    qualifications: branding.qualifications?.trim() || "",
    tradeName,
    legalName,
    taxId,
    addressLine: branding.show_address ? branding.address_line || "" : "",
    cityState: branding.show_city ? cityState : "",
    phone: branding.show_phone
      ? branding.phone || branding.professional_phone || fallback.phone || ""
      : "",
    email: branding.show_email
      ? branding.email || branding.professional_email || fallback.email || ""
      : "",
    website: branding.show_website ? branding.website || "" : "",
    header: {
      logo: branding.header_logo,
      clinic: branding.header_clinic,
      professional: branding.header_professional,
      crp: branding.header_crp,
      phone: branding.header_phone,
      email: branding.header_email,
      address: branding.header_address,
      website: branding.header_website,
    },
    footer: {
      clinic: branding.footer_clinic,
      professional: branding.footer_professional,
      crp: branding.footer_crp,
      phone: branding.footer_phone,
      email: branding.footer_email,
      address: branding.footer_address,
      website: branding.footer_website,
      pageNumbers: branding.footer_page_numbers,
      documentId: branding.footer_document_id,
      version: branding.footer_version,
      hash: branding.footer_hash,
    },
    colors: {
      primary: branding.color_primary,
      secondary: branding.color_secondary,
      headings: branding.color_headings,
      dividers: branding.color_dividers,
    },
    typography: branding.typography_preset,
    letterhead,
    cancellationNoticeHours: branding.cancellation_notice_hours,
    includeAiInformativeClause: branding.include_ai_informative_clause,
  };
}

export function logoMaxHeightPt(size: "small" | "medium" | "large" | "custom", custom?: number | null): number {
  if (size === "small") return 36;
  if (size === "large") return 88;
  if (size === "custom") return Math.min(140, Math.max(24, custom ?? 64));
  return 56;
}
