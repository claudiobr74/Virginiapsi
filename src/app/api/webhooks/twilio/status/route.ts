import { NextResponse, type NextRequest } from "next/server";
import { applyTwilioStatusCallback } from "@/features/communications/webhooks";
import { getServerEnv } from "@/lib/env/server";
import { isTwilioOperational } from "@/lib/integrations/twilio/enabled";
import {
  formDataToParams,
  isValidTwilioSignature,
} from "@/lib/integrations/twilio/signature";
import { BODY_LIMIT_BYTES, readLimitedText } from "@/lib/security/request-limits";
import { payloadTooLargeResponse } from "@/lib/security/http-responses";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  if (!isTwilioOperational(env) || !env.TWILIO_AUTH_TOKEN) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const limited = await readLimitedText(request, BODY_LIMIT_BYTES.twilioWebhook);
  if (!limited.ok) {
    return payloadTooLargeResponse();
  }
  const params = formDataToParams(new URLSearchParams(limited.text));
  const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/webhooks/twilio/status`;
  const signature = request.headers.get("x-twilio-signature");

  if (!isValidTwilioSignature(url, params, env.TWILIO_AUTH_TOKEN, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  try {
    const result = await applyTwilioStatusCallback(params);
    return NextResponse.json({ ok: true, result });
  } catch {
    return NextResponse.json({ error: "status_failed" }, { status: 500 });
  }
}
