/**
 * Twilio/WhatsApp is optional. Product decision: keep infrastructure, do not
 * send, cron-claim, or webhook-process unless TWILIO_ENABLED is explicitly true
 * and credentials + sender are present.
 */

export interface TwilioRuntimeFlags {
  TWILIO_ENABLED?: boolean;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_WHATSAPP_FROM?: string;
  TWILIO_MESSAGING_SERVICE_SID?: string;
}

export const TWILIO_DISABLED_USER_MESSAGE =
  "Integração opcional. Atualmente desativada enquanto custos e provedor são avaliados.";

export function isTwilioEnabled(env: TwilioRuntimeFlags): boolean {
  return env.TWILIO_ENABLED === true;
}

export function isTwilioOperational(
  env: TwilioRuntimeFlags,
): env is TwilioRuntimeFlags & { TWILIO_ACCOUNT_SID: string; TWILIO_AUTH_TOKEN: string } {
  if (!isTwilioEnabled(env)) {
    return false;
  }
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    return false;
  }
  return Boolean(env.TWILIO_WHATSAPP_FROM || env.TWILIO_MESSAGING_SERVICE_SID);
}
