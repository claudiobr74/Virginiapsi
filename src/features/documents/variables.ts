import "server-only";

import type { DocumentVariables } from "@/lib/documents/render-template";
import { getPatient } from "@/features/patients/queries";
import { getShellSettings } from "@/features/organizations/queries";
import { getDocumentBranding } from "@/features/documents/branding-queries";
import { getPracticeSettings } from "@/features/settings/queries";

/**
 * Builds the flat dot-path variable map a template placeholder resolves
 * against. Only ever reads what the caller is already authorized to see —
 * this never becomes a way to leak clinical fields into an administrative
 * document, since callers only ever pass patientId for documents that are
 * already scoped to that patient.
 */
export async function buildDocumentVariables(
  organizationId: string,
  patientId?: string | null,
): Promise<DocumentVariables> {
  const variables: DocumentVariables = {
    "date.today": new Date().toLocaleDateString("pt-BR"),
  };

  const settings = await getShellSettings(organizationId);
  const [practice, branding] = await Promise.all([
    getPracticeSettings(organizationId),
    getDocumentBranding(organizationId).catch(() => null),
  ]);
  if (settings?.professional_name) {
    variables["professional.name"] = settings.professional_name;
  }
  if (practice?.professional_name) {
    variables["professional.name"] = practice.professional_name;
  }
  if (branding?.professional_name) {
    variables["professional.name"] = branding.professional_name;
  }
  if (practice?.crp || branding?.crp) {
    const crp = branding?.crp || practice?.crp || "";
    const state = branding?.crp_state || "";
    const joined = [crp, state].filter(Boolean).join("/");
    if (joined) {
      variables["professional.crp"] = `CRP ${joined}`;
    }
  }
  if (branding?.professional_title) {
    variables["professional.title"] = branding.professional_title;
  } else {
    variables["professional.title"] = "Psicóloga";
  }
  if (settings?.organization_name) {
    variables["organization.name"] = settings.organization_name;
  }
  if (practice?.clinic_name) {
    variables["organization.name"] = practice.clinic_name;
  }
  if (branding?.clinic_name) {
    variables["organization.name"] = branding.clinic_name;
  }
  if (branding?.city?.trim()) {
    variables["organization.city"] = branding.city.trim();
  }
  variables["cancellation.notice_hours"] = String(branding?.cancellation_notice_hours ?? 24);
  if (branding?.phone) variables["organization.phone"] = branding.phone;
  if (branding?.email) variables["organization.email"] = branding.email;
  if (branding?.website) variables["organization.website"] = branding.website;
  if (branding?.address_line) variables["organization.address"] = branding.address_line;

  if (patientId) {
    const patient = await getPatient(organizationId, patientId);
    if (patient) {
      variables["patient.full_name"] = patient.full_name;
      variables["patient.preferred_name"] = patient.preferred_name;
      variables["patient.public_code"] = patient.public_code;
      if (patient.birth_date) {
        variables["patient.birth_date"] = new Date(
          `${patient.birth_date}T00:00:00`,
        ).toLocaleDateString("pt-BR");
      }
      if (patient.cpf) variables["patient.cpf"] = patient.cpf;
      if (patient.phone) variables["patient.phone"] = patient.phone;
      if (patient.email) variables["patient.email"] = patient.email;
      const guardian = patient.responsibles[0];
      if (guardian) {
        variables["guardian.name"] = guardian.name;
        variables["guardian.relationship"] = guardian.relationship;
        variables["guardian.phone"] = guardian.phone;
        if (guardian.email) variables["guardian.email"] = guardian.email;
      }
    }
  }

  return variables;
}
