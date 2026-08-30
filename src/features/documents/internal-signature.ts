import { sha256Hex } from "@/lib/documents/storage-meta";

export const INTERNAL_SIGNATURE_METHOD = "virginiapsi_internal" as const;

export const INTERNAL_SIGNATURE_DISCLAIMER =
  "Documento confirmado eletronicamente no VirgíniaPsi. Isto não é assinatura digital ICP-Brasil.";

export interface InternalSignaturePayload {
  organizationId: string;
  documentId: string;
  documentVersion: number;
  body: string;
  professionalUserId: string;
  professionalName: string;
  professionalRegistration: string | null;
  professionalRegistrationState: string | null;
  signedAt: string;
}

export function canonicalSignatureContent(payload: InternalSignaturePayload): string {
  return [
    payload.organizationId,
    payload.documentId,
    String(payload.documentVersion),
    payload.body,
    payload.professionalUserId,
    payload.professionalName,
    payload.professionalRegistration ?? "",
    payload.professionalRegistrationState ?? "",
    payload.signedAt,
    INTERNAL_SIGNATURE_METHOD,
  ].join("\n");
}

export function hashCanonicalSignatureContent(payload: InternalSignaturePayload): string {
  return sha256Hex(Buffer.from(canonicalSignatureContent(payload), "utf8"));
}

export function buildInternalSignaturePdfLines(input: {
  professionalName: string;
  professionalRegistration: string | null;
  professionalRegistrationState: string | null;
  signedAtLabel: string;
  identifier: string;
  contentSha256: string;
}): string[] {
  const crp = [input.professionalRegistration, input.professionalRegistrationState]
    .filter(Boolean)
    .join(" / ");
  return [
    INTERNAL_SIGNATURE_DISCLAIMER,
    `Profissional: ${input.professionalName}`,
    `CRP: ${crp || "não informado"}`,
    `Data e hora: ${input.signedAtLabel}`,
    `Identificador: ${input.identifier}`,
    `Hash SHA-256: ${input.contentSha256}`,
  ];
}
