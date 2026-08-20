/**
 * Normalize a phone to E.164. Brazilian numbers without a country code
 * receive +55. Returns null when the input cannot yield a valid number.
 */
export function normalizeE164(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }
  const digits = input.replace(/\D/g, "");
  if (digits.length < 10) {
    return null;
  }
  if (digits.startsWith("55") && digits.length >= 12) {
    return `+${digits}`;
  }
  if (digits.startsWith("00") && digits.length >= 12) {
    return `+${digits.slice(2)}`;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  if (digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

export function toWhatsAppAddress(e164: string): string {
  const normalized = e164.startsWith("+") ? e164 : `+${e164.replace(/\D/g, "")}`;
  return normalized.startsWith("whatsapp:") ? normalized : `whatsapp:${normalized}`;
}
