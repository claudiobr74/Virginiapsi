import type {
  DocumentBrandingRow,
  LetterheadPreset,
  TypographyPreset,
  UpdateBrandingValues,
} from "@/features/documents/branding-contracts";
import { BRANDING_PALETTES, profileTypography } from "@/features/documents/branding-presets";
import { profileLetterhead, RECOMMENDED_BRANDING_VISIBILITY, toDocumentBrandingRow } from "@/features/documents/branding-resolve";
import type { VisualProfile } from "@/features/documents/contracts";

export interface BrandingIdentityFallback {
  organizationName?: string | null;
  professionalName?: string | null;
  crp?: string | null;
  crpState?: string | null;
  clinicName?: string | null;
  phone?: string | null;
  email?: string | null;
  legalName?: string | null;
  taxId?: string | null;
}

export interface BrandingFormState {
  clinicName: string;
  tradeName: string;
  legalName: string;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  email: string;
  website: string;
  taxId: string;
  professionalName: string;
  crp: string;
  crpState: string;
  professionalTitle: string;
  qualifications: string;
  professionalPhone: string;
  professionalEmail: string;
  colorPrimary: string;
  colorSecondary: string;
  colorHeadings: string;
  colorDividers: string;
  typographyPreset: TypographyPreset;
  letterheadPreset: LetterheadPreset;
  defaultVisualProfile: VisualProfile;
  cancellationNoticeHours: number;
  includeAiInformativeClause: boolean;
  headerLogo: boolean;
  headerClinic: boolean;
  headerProfessional: boolean;
  headerCrp: boolean;
  headerPhone: boolean;
  headerEmail: boolean;
  headerAddress: boolean;
  headerWebsite: boolean;
  footerClinic: boolean;
  footerProfessional: boolean;
  footerCrp: boolean;
  footerPhone: boolean;
  footerEmail: boolean;
  footerAddress: boolean;
  footerWebsite: boolean;
  footerPageNumbers: boolean;
  footerDocumentId: boolean;
  footerVersion: boolean;
  footerHash: boolean;
  showClinicName: boolean;
  showAddress: boolean;
  showCity: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showWebsite: boolean;
  showTaxId: boolean;
  showTradeName: boolean;
  showLegalName: boolean;
}

const SALVIA = BRANDING_PALETTES[0].colors;

function text(value: string | null | undefined): string {
  return value ?? "";
}

export function brandingFormFromRow(branding: DocumentBrandingRow | null): BrandingFormState {
  if (!branding) {
    return {
      clinicName: "",
      tradeName: "",
      legalName: "",
      addressLine: "",
      city: "",
      state: "",
      postalCode: "",
      phone: "",
      email: "",
      website: "",
      taxId: "",
      professionalName: "",
      crp: "",
      crpState: "",
      professionalTitle: "",
      qualifications: "",
      professionalPhone: "",
      professionalEmail: "",
      colorPrimary: SALVIA.primary,
      colorSecondary: SALVIA.secondary,
      colorHeadings: SALVIA.headings,
      colorDividers: SALVIA.dividers,
      typographyPreset: "classica",
      letterheadPreset: "clinico",
      defaultVisualProfile: "clinica",
      cancellationNoticeHours: 24,
      includeAiInformativeClause: false,
      headerLogo: RECOMMENDED_BRANDING_VISIBILITY.header_logo,
      headerClinic: RECOMMENDED_BRANDING_VISIBILITY.header_clinic,
      headerProfessional: RECOMMENDED_BRANDING_VISIBILITY.header_professional,
      headerCrp: RECOMMENDED_BRANDING_VISIBILITY.header_crp,
      headerPhone: RECOMMENDED_BRANDING_VISIBILITY.header_phone,
      headerEmail: RECOMMENDED_BRANDING_VISIBILITY.header_email,
      headerAddress: RECOMMENDED_BRANDING_VISIBILITY.header_address,
      headerWebsite: RECOMMENDED_BRANDING_VISIBILITY.header_website,
      footerClinic: RECOMMENDED_BRANDING_VISIBILITY.footer_clinic,
      footerProfessional: RECOMMENDED_BRANDING_VISIBILITY.footer_professional,
      footerCrp: RECOMMENDED_BRANDING_VISIBILITY.footer_crp,
      footerPhone: RECOMMENDED_BRANDING_VISIBILITY.footer_phone,
      footerEmail: RECOMMENDED_BRANDING_VISIBILITY.footer_email,
      footerAddress: RECOMMENDED_BRANDING_VISIBILITY.footer_address,
      footerWebsite: RECOMMENDED_BRANDING_VISIBILITY.footer_website,
      footerPageNumbers: RECOMMENDED_BRANDING_VISIBILITY.footer_page_numbers,
      footerDocumentId: RECOMMENDED_BRANDING_VISIBILITY.footer_document_id,
      footerVersion: RECOMMENDED_BRANDING_VISIBILITY.footer_version,
      footerHash: RECOMMENDED_BRANDING_VISIBILITY.footer_hash,
      showClinicName: RECOMMENDED_BRANDING_VISIBILITY.show_clinic_name,
      showAddress: RECOMMENDED_BRANDING_VISIBILITY.show_address,
      showCity: RECOMMENDED_BRANDING_VISIBILITY.show_city,
      showPhone: RECOMMENDED_BRANDING_VISIBILITY.show_phone,
      showEmail: RECOMMENDED_BRANDING_VISIBILITY.show_email,
      showWebsite: RECOMMENDED_BRANDING_VISIBILITY.show_website,
      showTaxId: RECOMMENDED_BRANDING_VISIBILITY.show_tax_id,
      showTradeName: RECOMMENDED_BRANDING_VISIBILITY.show_trade_name,
      showLegalName: RECOMMENDED_BRANDING_VISIBILITY.show_legal_name,
    };
  }
  return {
    clinicName: text(branding.clinic_name),
    tradeName: text(branding.trade_name),
    legalName: text(branding.legal_name),
    addressLine: text(branding.address_line),
    city: text(branding.city),
    state: text(branding.state),
    postalCode: text(branding.postal_code),
    phone: text(branding.phone),
    email: text(branding.email),
    website: text(branding.website),
    taxId: text(branding.tax_id),
    professionalName: text(branding.professional_name),
    crp: text(branding.crp),
    crpState: text(branding.crp_state),
    professionalTitle: text(branding.professional_title),
    qualifications: text(branding.qualifications),
    professionalPhone: text(branding.professional_phone),
    professionalEmail: text(branding.professional_email),
    colorPrimary: branding.color_primary,
    colorSecondary: branding.color_secondary,
    colorHeadings: branding.color_headings,
    colorDividers: branding.color_dividers,
    typographyPreset: branding.typography_preset,
    letterheadPreset: branding.letterhead_preset,
    defaultVisualProfile: branding.default_visual_profile,
    cancellationNoticeHours: branding.cancellation_notice_hours,
    includeAiInformativeClause: branding.include_ai_informative_clause,
    headerLogo: branding.header_logo,
    headerClinic: branding.header_clinic,
    headerProfessional: branding.header_professional,
    headerCrp: branding.header_crp,
    headerPhone: branding.header_phone,
    headerEmail: branding.header_email,
    headerAddress: branding.header_address,
    headerWebsite: branding.header_website,
    footerClinic: branding.footer_clinic,
    footerProfessional: branding.footer_professional,
    footerCrp: branding.footer_crp,
    footerPhone: branding.footer_phone,
    footerEmail: branding.footer_email,
    footerAddress: branding.footer_address,
    footerWebsite: branding.footer_website,
    footerPageNumbers: branding.footer_page_numbers,
    footerDocumentId: branding.footer_document_id,
    footerVersion: branding.footer_version,
    footerHash: branding.footer_hash,
    showClinicName: branding.show_clinic_name,
    showAddress: branding.show_address,
    showCity: branding.show_city,
    showPhone: branding.show_phone,
    showEmail: branding.show_email,
    showWebsite: branding.show_website,
    showTaxId: branding.show_tax_id,
    showTradeName: branding.show_trade_name,
    showLegalName: branding.show_legal_name,
  };
}

export function brandingFormToRow(
  form: BrandingFormState,
  organizationId?: string,
): DocumentBrandingRow {
  return toDocumentBrandingRow({
    organization_id: organizationId,
    clinic_name: form.clinicName.trim() || null,
    trade_name: form.tradeName.trim() || null,
    legal_name: form.legalName.trim() || null,
    address_line: form.addressLine.trim() || null,
    city: form.city.trim() || null,
    state: form.state.trim() || null,
    postal_code: form.postalCode.trim() || null,
    phone: form.phone.trim() || null,
    email: form.email.trim() || null,
    website: form.website.trim() || null,
    tax_id: form.taxId.trim() || null,
    professional_name: form.professionalName.trim() || null,
    crp: form.crp.trim() || null,
    crp_state: form.crpState.trim() || null,
    professional_title: form.professionalTitle.trim() || null,
    qualifications: form.qualifications.trim() || null,
    professional_phone: form.professionalPhone.trim() || null,
    professional_email: form.professionalEmail.trim() || null,
    show_clinic_name: form.showClinicName,
    show_trade_name: form.showTradeName,
    show_legal_name: form.showLegalName,
    show_address: form.showAddress,
    show_city: form.showCity,
    show_phone: form.showPhone,
    show_email: form.showEmail,
    show_website: form.showWebsite,
    show_tax_id: form.showTaxId,
    header_logo: form.headerLogo,
    header_clinic: form.headerClinic,
    header_professional: form.headerProfessional,
    header_crp: form.headerCrp,
    header_phone: form.headerPhone,
    header_email: form.headerEmail,
    header_address: form.headerAddress,
    header_website: form.headerWebsite,
    footer_clinic: form.footerClinic,
    footer_professional: form.footerProfessional,
    footer_crp: form.footerCrp,
    footer_phone: form.footerPhone,
    footer_email: form.footerEmail,
    footer_address: form.footerAddress,
    footer_website: form.footerWebsite,
    footer_page_numbers: form.footerPageNumbers,
    footer_document_id: form.footerDocumentId,
    footer_version: form.footerVersion,
    footer_hash: form.footerHash,
    color_primary: form.colorPrimary,
    color_secondary: form.colorSecondary,
    color_headings: form.colorHeadings,
    color_dividers: form.colorDividers,
    typography_preset: form.typographyPreset,
    letterhead_preset: form.letterheadPreset,
    default_visual_profile: form.defaultVisualProfile,
    cancellation_notice_hours: form.cancellationNoticeHours,
    include_ai_informative_clause: form.includeAiInformativeClause,
  });
}

export function brandingFormToUpdateInput(form: BrandingFormState): UpdateBrandingValues {
  return {
    clinicName: form.clinicName,
    tradeName: form.tradeName,
    legalName: form.legalName,
    addressLine: form.addressLine,
    city: form.city,
    state: form.state,
    postalCode: form.postalCode,
    phone: form.phone,
    email: form.email,
    website: form.website,
    taxId: form.taxId,
    professionalName: form.professionalName,
    crp: form.crp,
    crpState: form.crpState,
    professionalTitle: form.professionalTitle,
    qualifications: form.qualifications,
    professionalPhone: form.professionalPhone,
    professionalEmail: form.professionalEmail,
    showClinicName: form.showClinicName,
    showTradeName: form.showTradeName,
    showLegalName: form.showLegalName,
    showAddress: form.showAddress,
    showCity: form.showCity,
    showPhone: form.showPhone,
    showEmail: form.showEmail,
    showWebsite: form.showWebsite,
    showTaxId: form.showTaxId,
    headerLogo: form.headerLogo,
    headerClinic: form.headerClinic,
    headerProfessional: form.headerProfessional,
    headerCrp: form.headerCrp,
    headerPhone: form.headerPhone,
    headerEmail: form.headerEmail,
    headerAddress: form.headerAddress,
    headerWebsite: form.headerWebsite,
    footerClinic: form.footerClinic,
    footerProfessional: form.footerProfessional,
    footerCrp: form.footerCrp,
    footerPhone: form.footerPhone,
    footerEmail: form.footerEmail,
    footerAddress: form.footerAddress,
    footerWebsite: form.footerWebsite,
    footerPageNumbers: form.footerPageNumbers,
    footerDocumentId: form.footerDocumentId,
    footerVersion: form.footerVersion,
    footerHash: form.footerHash,
    colorPrimary: form.colorPrimary,
    colorSecondary: form.colorSecondary,
    colorHeadings: form.colorHeadings,
    colorDividers: form.colorDividers,
    typographyPreset: form.typographyPreset,
    letterheadPreset: form.letterheadPreset,
    defaultVisualProfile: form.defaultVisualProfile,
    cancellationNoticeHours: form.cancellationNoticeHours,
    includeAiInformativeClause: form.includeAiInformativeClause,
  };
}

export function applyVisualStyleToForm(
  form: BrandingFormState,
  profile: VisualProfile,
): BrandingFormState {
  return {
    ...form,
    defaultVisualProfile: profile,
    letterheadPreset: profileLetterhead(profile),
    typographyPreset: profileTypography(profile),
  };
}

export function restoreRecommendedVisual(form: BrandingFormState): BrandingFormState {
  return applyVisualStyleToForm(
    {
      ...form,
      colorPrimary: SALVIA.primary,
      colorSecondary: SALVIA.secondary,
      colorHeadings: SALVIA.headings,
      colorDividers: SALVIA.dividers,
      headerLogo: RECOMMENDED_BRANDING_VISIBILITY.header_logo,
      headerClinic: RECOMMENDED_BRANDING_VISIBILITY.header_clinic,
      headerProfessional: RECOMMENDED_BRANDING_VISIBILITY.header_professional,
      headerCrp: RECOMMENDED_BRANDING_VISIBILITY.header_crp,
      headerPhone: RECOMMENDED_BRANDING_VISIBILITY.header_phone,
      headerEmail: RECOMMENDED_BRANDING_VISIBILITY.header_email,
      headerAddress: RECOMMENDED_BRANDING_VISIBILITY.header_address,
      headerWebsite: RECOMMENDED_BRANDING_VISIBILITY.header_website,
      footerClinic: RECOMMENDED_BRANDING_VISIBILITY.footer_clinic,
      footerProfessional: RECOMMENDED_BRANDING_VISIBILITY.footer_professional,
      footerCrp: RECOMMENDED_BRANDING_VISIBILITY.footer_crp,
      footerPhone: RECOMMENDED_BRANDING_VISIBILITY.footer_phone,
      footerEmail: RECOMMENDED_BRANDING_VISIBILITY.footer_email,
      footerAddress: RECOMMENDED_BRANDING_VISIBILITY.footer_address,
      footerWebsite: RECOMMENDED_BRANDING_VISIBILITY.footer_website,
      footerPageNumbers: RECOMMENDED_BRANDING_VISIBILITY.footer_page_numbers,
      footerDocumentId: RECOMMENDED_BRANDING_VISIBILITY.footer_document_id,
      footerVersion: RECOMMENDED_BRANDING_VISIBILITY.footer_version,
      footerHash: RECOMMENDED_BRANDING_VISIBILITY.footer_hash,
      showClinicName: RECOMMENDED_BRANDING_VISIBILITY.show_clinic_name,
      showAddress: RECOMMENDED_BRANDING_VISIBILITY.show_address,
      showCity: RECOMMENDED_BRANDING_VISIBILITY.show_city,
      showPhone: RECOMMENDED_BRANDING_VISIBILITY.show_phone,
      showEmail: RECOMMENDED_BRANDING_VISIBILITY.show_email,
      showWebsite: RECOMMENDED_BRANDING_VISIBILITY.show_website,
      showTaxId: RECOMMENDED_BRANDING_VISIBILITY.show_tax_id,
      showTradeName: RECOMMENDED_BRANDING_VISIBILITY.show_trade_name,
      showLegalName: RECOMMENDED_BRANDING_VISIBILITY.show_legal_name,
    },
    "clinica",
  );
}

export function brandingFormsEqual(a: BrandingFormState, b: BrandingFormState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function buildDocumentBrandingPersistRow(
  v: UpdateBrandingValues,
  fallback: DocumentBrandingRow,
  organizationId: string,
) {
  return {
    organization_id: organizationId,
    clinic_name: v.clinicName !== undefined ? emptyToNull(v.clinicName) : fallback.clinic_name,
    trade_name: v.tradeName !== undefined ? emptyToNull(v.tradeName) : fallback.trade_name,
    legal_name: v.legalName !== undefined ? emptyToNull(v.legalName) : fallback.legal_name,
    address_line: v.addressLine !== undefined ? emptyToNull(v.addressLine) : fallback.address_line,
    city: v.city !== undefined ? emptyToNull(v.city) : fallback.city,
    state: v.state !== undefined ? emptyToNull(v.state) : fallback.state,
    postal_code: v.postalCode !== undefined ? emptyToNull(v.postalCode) : fallback.postal_code,
    phone: v.phone !== undefined ? emptyToNull(v.phone) : fallback.phone,
    email: v.email !== undefined ? emptyToNull(v.email) : fallback.email,
    website: v.website !== undefined ? emptyToNull(v.website) : fallback.website,
    tax_id: v.taxId !== undefined ? emptyToNull(v.taxId) : fallback.tax_id,
    professional_name:
      v.professionalName !== undefined ? emptyToNull(v.professionalName) : fallback.professional_name,
    crp: v.crp !== undefined ? emptyToNull(v.crp) : fallback.crp,
    crp_state: v.crpState !== undefined ? emptyToNull(v.crpState) : fallback.crp_state,
    professional_title:
      v.professionalTitle !== undefined ? emptyToNull(v.professionalTitle) : fallback.professional_title,
    qualifications:
      v.qualifications !== undefined ? emptyToNull(v.qualifications) : fallback.qualifications,
    professional_phone:
      v.professionalPhone !== undefined ? emptyToNull(v.professionalPhone) : fallback.professional_phone,
    professional_email:
      v.professionalEmail !== undefined ? emptyToNull(v.professionalEmail) : fallback.professional_email,
    show_clinic_name: v.showClinicName ?? fallback.show_clinic_name,
    show_trade_name: v.showTradeName ?? fallback.show_trade_name,
    show_legal_name: v.showLegalName ?? fallback.show_legal_name,
    show_address: v.showAddress ?? fallback.show_address,
    show_city: v.showCity ?? fallback.show_city,
    show_phone: v.showPhone ?? fallback.show_phone,
    show_email: v.showEmail ?? fallback.show_email,
    show_website: v.showWebsite ?? fallback.show_website,
    show_tax_id: v.showTaxId ?? fallback.show_tax_id,
    header_logo: v.headerLogo ?? fallback.header_logo,
    header_clinic: v.headerClinic ?? fallback.header_clinic,
    header_professional: v.headerProfessional ?? fallback.header_professional,
    header_crp: v.headerCrp ?? fallback.header_crp,
    header_phone: v.headerPhone ?? fallback.header_phone,
    header_email: v.headerEmail ?? fallback.header_email,
    header_address: v.headerAddress ?? fallback.header_address,
    header_website: v.headerWebsite ?? fallback.header_website,
    footer_clinic: v.footerClinic ?? fallback.footer_clinic,
    footer_professional: v.footerProfessional ?? fallback.footer_professional,
    footer_crp: v.footerCrp ?? fallback.footer_crp,
    footer_phone: v.footerPhone ?? fallback.footer_phone,
    footer_email: v.footerEmail ?? fallback.footer_email,
    footer_address: v.footerAddress ?? fallback.footer_address,
    footer_website: v.footerWebsite ?? fallback.footer_website,
    footer_page_numbers: v.footerPageNumbers ?? fallback.footer_page_numbers,
    footer_document_id: v.footerDocumentId ?? fallback.footer_document_id,
    footer_version: v.footerVersion ?? fallback.footer_version,
    footer_hash: v.footerHash ?? fallback.footer_hash,
    color_primary: v.colorPrimary ?? fallback.color_primary,
    color_secondary: v.colorSecondary ?? fallback.color_secondary,
    color_headings: v.colorHeadings ?? fallback.color_headings,
    color_dividers: v.colorDividers ?? fallback.color_dividers,
    typography_preset: v.typographyPreset ?? fallback.typography_preset,
    letterhead_preset: v.letterheadPreset ?? fallback.letterhead_preset,
    default_visual_profile: v.defaultVisualProfile ?? fallback.default_visual_profile,
    cancellation_notice_hours: v.cancellationNoticeHours ?? fallback.cancellation_notice_hours,
    adjustment_cadence: v.adjustmentCadence ?? fallback.adjustment_cadence,
    include_ai_informative_clause:
      v.includeAiInformativeClause ?? fallback.include_ai_informative_clause,
    default_logo_id: v.defaultLogoId !== undefined ? v.defaultLogoId : fallback.default_logo_id,
  };
}
