import { NextResponse, type NextRequest } from "next/server";
import { runAudioRetentionJob } from "@/features/settings/purge-fallback-audio";
import { getServerEnv } from "@/lib/env/server";
import { isValidCronRequest } from "@/lib/integrations/twilio/cron-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  if (!isValidCronRequest(request, env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAudioRetentionJob();
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "job_failed" }, { status: 500 });
  }
}
