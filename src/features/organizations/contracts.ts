import { z } from "zod";

export const ORGANIZATION_ROLES = [
  "psychologist_admin",
  "psychologist",
  "secretary",
] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const SECRETARY_FINANCE_ACCESS_VALUES = [
  "none",
  "view",
  "manage",
] as const;
export type SecretaryFinanceAccess =
  (typeof SECRETARY_FINANCE_ACCESS_VALUES)[number];

export const membershipRowSchema = z.object({
  organization_id: z.string().uuid(),
  role: z.enum(ORGANIZATION_ROLES),
  active: z.boolean(),
});

export const organizationRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  timezone: z.string(),
  status: z.enum(["active", "suspended"]),
});

export const shellSettingsRowSchema = z.object({
  organization_id: z.string().uuid(),
  organization_name: z.string(),
  timezone: z.string(),
  professional_name: z.string().nullable(),
  clinic_name: z.string().nullable(),
  inactivity_timeout_minutes: z.number().int().positive(),
  session_duration_minutes: z.number().int().positive(),
  greeting_prefix: z.string().nullable(),
  quote: z.string().nullable(),
  photo_path: z.string().nullable().optional().default(null),
});

export type ShellSettings = z.infer<typeof shellSettingsRowSchema>;

export interface Membership {
  organizationId: string;
  organizationName: string;
  slug: string;
  timezone: string;
  role: OrganizationRole;
}

export const bootstrapOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome do consultório.")
    .max(160, "Nome muito longo."),
  professionalName: z
    .string()
    .trim()
    .max(160, "Nome muito longo.")
    .optional()
    .or(z.literal("")),
});

export type BootstrapOrganizationValues = z.infer<
  typeof bootstrapOrganizationSchema
>;

/** Slugs are derived server-side; the client never chooses the tenant key. */
export function slugFromName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  const suffix = Math.random().toString(36).slice(2, 8);
  return base ? `${base}-${suffix}` : `consultorio-${suffix}`;
}
