import { z } from "zod";

export const LOGO_VARIANT_VALUES = [
  "principal",
  "horizontal",
  "compacta",
  "monocromatica",
  "profissional",
  "outra",
] as const;
export type LogoVariant = (typeof LOGO_VARIANT_VALUES)[number];

export const TYPOGRAPHY_PRESET_VALUES = [
  "classica",
  "moderna",
  "institucional",
  "editorial",
] as const;
export type TypographyPreset = (typeof TYPOGRAPHY_PRESET_VALUES)[number];

export const LETTERHEAD_PRESET_VALUES = [
  "clinico",
  "minimalista",
  "institucional",
  "profissional",
  "premium",
] as const;
export type LetterheadPreset = (typeof LETTERHEAD_PRESET_VALUES)[number];

export const LOGO_MIME_VALUES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;
export type LogoMime = (typeof LOGO_MIME_VALUES)[number];

export const PRINTABLE_LOGO_MIME = ["image/png", "image/jpeg"] as const;

export const documentBrandingRowSchema = z.object({
  organization_id: z.string().uuid(),
  clinic_name: z.string().nullable().optional().default(null),
  trade_name: z.string().nullable().optional().default(null),
  legal_name: z.string().nullable().optional().default(null),
  address_line: z.string().nullable().optional().default(null),
  city: z.string().nullable().optional().default(null),
  state: z.string().nullable().optional().default(null),
  postal_code: z.string().nullable().optional().default(null),
  phone: z.string().nullable().optional().default(null),
  email: z.string().nullable().optional().default(null),
  website: z.string().nullable().optional().default(null),
  tax_id: z.string().nullable().optional().default(null),
  professional_name: z.string().nullable().optional().default(null),
  crp: z.string().nullable().optional().default(null),
  crp_state: z.string().nullable().optional().default(null),
  professional_title: z.string().nullable().optional().default(null),
  qualifications: z.string().nullable().optional().default(null),
  professional_phone: z.string().nullable().optional().default(null),
  professional_email: z.string().nullable().optional().default(null),
  show_clinic_name: z.boolean().optional().default(true),
  show_trade_name: z.boolean().optional().default(false),
  show_legal_name: z.boolean().optional().default(false),
  show_address: z.boolean().optional().default(false),
  show_city: z.boolean().optional().default(true),
  show_phone: z.boolean().optional().default(true),
  show_email: z.boolean().optional().default(true),
  show_website: z.boolean().optional().default(false),
  show_tax_id: z.boolean().optional().default(false),
  header_logo: z.boolean().optional().default(true),
  header_clinic: z.boolean().optional().default(true),
  header_professional: z.boolean().optional().default(true),
  header_crp: z.boolean().optional().default(true),
  header_phone: z.boolean().optional().default(false),
  header_email: z.boolean().optional().default(false),
  header_address: z.boolean().optional().default(false),
  header_website: z.boolean().optional().default(false),
  footer_clinic: z.boolean().optional().default(false),
  footer_professional: z.boolean().optional().default(false),
  footer_crp: z.boolean().optional().default(false),
  footer_phone: z.boolean().optional().default(true),
  footer_email: z.boolean().optional().default(true),
  footer_address: z.boolean().optional().default(true),
  footer_website: z.boolean().optional().default(false),
  footer_page_numbers: z.boolean().optional().default(true),
  footer_document_id: z.boolean().optional().default(false),
  footer_version: z.boolean().optional().default(false),
  footer_hash: z.boolean().optional().default(false),
  color_primary: z.string().optional().default("#3a4f43"),
  color_secondary: z.string().optional().default("#8a8f8a"),
  color_headings: z.string().optional().default("#171816"),
  color_dividers: z.string().optional().default("#c5d0c6"),
  typography_preset: z.enum(TYPOGRAPHY_PRESET_VALUES).optional().default("classica"),
  letterhead_preset: z.enum(LETTERHEAD_PRESET_VALUES).optional().default("clinico"),
  default_visual_profile: z
    .enum(["essencial", "clinica", "institucional", "premium"])
    .optional()
    .default("clinica"),
  category_profile_map: z.record(z.string(), z.string()).optional().default({}),
  default_logo_id: z.string().uuid().nullable().optional().default(null),
  cancellation_notice_hours: z.number().int().optional().default(24),
  adjustment_cadence: z
    .enum(["anual", "semestral", "outro", "nao_definido"])
    .optional()
    .default("anual"),
  include_ai_informative_clause: z.boolean().optional().default(false),
  updated_at: z.string().optional(),
});
export type DocumentBrandingRow = z.infer<typeof documentBrandingRowSchema>;

export const documentLogoRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  variant: z.enum(LOGO_VARIANT_VALUES),
  label: z.string(),
  storage_path: z.string(),
  print_storage_path: z.string().nullable().optional().default(null),
  mime_type: z.string(),
  byte_size: z.number(),
  sha256: z.string(),
  width_px: z.number().nullable().optional().default(null),
  height_px: z.number().nullable().optional().default(null),
  is_default: z.boolean(),
  created_at: z.string(),
});
export type DocumentLogoRow = z.infer<typeof documentLogoRowSchema>;

export const updateBrandingSchema = z.object({
  clinicName: z.string().trim().max(160).optional(),
  tradeName: z.string().trim().max(160).optional(),
  legalName: z.string().trim().max(200).optional(),
  addressLine: z.string().trim().max(240).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(2).optional(),
  postalCode: z.string().trim().max(12).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(160).optional(),
  website: z.string().trim().max(160).optional(),
  taxId: z.string().trim().max(20).optional(),
  professionalName: z.string().trim().max(160).optional(),
  crp: z.string().trim().max(40).optional(),
  crpState: z.string().trim().max(2).optional(),
  professionalTitle: z.string().trim().max(120).optional(),
  qualifications: z.string().trim().max(400).optional(),
  professionalPhone: z.string().trim().max(40).optional(),
  professionalEmail: z.string().trim().max(160).optional(),
  showClinicName: z.boolean().optional(),
  showTradeName: z.boolean().optional(),
  showLegalName: z.boolean().optional(),
  showAddress: z.boolean().optional(),
  showCity: z.boolean().optional(),
  showPhone: z.boolean().optional(),
  showEmail: z.boolean().optional(),
  showWebsite: z.boolean().optional(),
  showTaxId: z.boolean().optional(),
  headerLogo: z.boolean().optional(),
  headerClinic: z.boolean().optional(),
  headerProfessional: z.boolean().optional(),
  headerCrp: z.boolean().optional(),
  headerPhone: z.boolean().optional(),
  headerEmail: z.boolean().optional(),
  headerAddress: z.boolean().optional(),
  headerWebsite: z.boolean().optional(),
  footerClinic: z.boolean().optional(),
  footerProfessional: z.boolean().optional(),
  footerCrp: z.boolean().optional(),
  footerPhone: z.boolean().optional(),
  footerEmail: z.boolean().optional(),
  footerAddress: z.boolean().optional(),
  footerWebsite: z.boolean().optional(),
  footerPageNumbers: z.boolean().optional(),
  footerDocumentId: z.boolean().optional(),
  footerVersion: z.boolean().optional(),
  footerHash: z.boolean().optional(),
  colorPrimary: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  colorSecondary: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  colorHeadings: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  colorDividers: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  typographyPreset: z.enum(TYPOGRAPHY_PRESET_VALUES).optional(),
  letterheadPreset: z.enum(LETTERHEAD_PRESET_VALUES).optional(),
  defaultVisualProfile: z.enum(["essencial", "clinica", "institucional", "premium"]).optional(),
  cancellationNoticeHours: z.number().int().min(1).max(168).optional(),
  adjustmentCadence: z.enum(["anual", "semestral", "outro", "nao_definido"]).optional(),
  includeAiInformativeClause: z.boolean().optional(),
  defaultLogoId: z.string().uuid().nullable().optional(),
});
export type UpdateBrandingValues = z.infer<typeof updateBrandingSchema>;

export const registerLogoSchema = z.object({
  variant: z.enum(LOGO_VARIANT_VALUES),
  label: z.string().trim().max(80).optional(),
  storagePath: z.string().min(1),
  printStoragePath: z.string().nullable().optional(),
  mimeType: z.enum(LOGO_MIME_VALUES),
  byteSize: z.number().int().positive().max(2_097_152),
  sha256: z.string().min(32),
  isDefault: z.boolean().optional(),
});
