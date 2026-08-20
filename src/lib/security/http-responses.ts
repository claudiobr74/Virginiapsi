import { NextResponse } from "next/server";

export function payloadTooLargeResponse() {
  return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
}

export function invalidJsonResponse() {
  return NextResponse.json({ error: "invalid_request" }, { status: 400 });
}

export function tooManyRequestsResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}
