import { NextResponse, type NextRequest } from "next/server";
import { applyTwilioInbound } from "@/features/communications/webhooks";
import { getServerEnv } from "@/lib/env/server";
import {
  formDataToParams,
  isValidTwilioSignature,
} from "@/lib/integrations/twilio/signature";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  const params = formDataToParams(new URLSearchParams(await request.text()));
  const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/webhooks/twilio/inbound`;
  const signature = request.headers.get("x-twilio-signature");

  if (!isValidTwilioSignature(url, params, env.TWILIO_AUTH_TOKEN, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  try {
    const result = await applyTwilioInbound(params);
    return new NextResponse(null, { status: result === "ignored" ? 204 : 200 });
  } catch {
    return NextResponse.json({ error: "inbound_failed" }, { status: 500 });
  }
}
