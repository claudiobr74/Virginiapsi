import { NextResponse, type NextRequest } from "next/server";
import { processDueWhatsappReminders } from "@/features/communications/process-reminders";
import { getServerEnv } from "@/lib/env/server";
import { isValidCronRequest } from "@/lib/integrations/twilio/cron-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  if (!isValidCronRequest(request, env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await processDueWhatsappReminders();
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "job_failed" }, { status: 500 });
  }
}
