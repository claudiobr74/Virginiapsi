import { NextResponse, type NextRequest } from "next/server";
import {
  cookieListHasPkceVerifier,
  PKCE_FLOW_ID_QUERY,
  resolvePkceFlowId,
} from "@/features/auth/pkce-flow";
import { resolvePublicAuthOrigin } from "@/features/auth/public-origin";

export type OAuthCallbackStage = "missing_code" | "exchange_failed" | "session_created";

export type OAuthExchangeErrorMeta = {
  name?: string;
  code?: string;
  status?: number;
};

export type OAuthExchangeFn = (input: {
  code: string;
  flowId?: string;
}) => Promise<{ error: OAuthExchangeErrorMeta | null }>;

export interface CompleteAuthCallbackDeps {
  exchange: OAuthExchangeFn;
  acceptInvitations: () => Promise<void>;
  log?: (payload: Record<string, unknown>) => void;
  randomId?: () => string;
}

function correlationIdFromRequest(request: NextRequest, randomId: () => string): string {
  const vercelId = request.headers.get("x-vercel-id")?.trim();
  if (vercelId && /^[A-Za-z0-9:._-]+$/.test(vercelId) && vercelId.length <= 128) {
    return vercelId;
  }
  return randomId();
}

function safeAuthErrorMeta(error: OAuthExchangeErrorMeta | null): OAuthExchangeErrorMeta {
  if (!error) {
    return {};
  }
  return {
    ...(typeof error.name === "string" ? { name: error.name.slice(0, 120) } : {}),
    ...(typeof error.code === "string" ? { code: error.code.slice(0, 120) } : {}),
    ...(typeof error.status === "number" && Number.isFinite(error.status)
      ? { status: error.status }
      : {}),
  };
}

export function buildOAuthCallbackLog(input: {
  event: string;
  correlationId: string;
  stage: OAuthCallbackStage;
  hostname: string;
  forwardedHost: string | null;
  hostMismatch: boolean;
  hasFlowId: boolean;
  hasPkceCookie: boolean;
  authError?: OAuthExchangeErrorMeta;
}): Record<string, unknown> {
  const authError = safeAuthErrorMeta(input.authError ?? null);
  return {
    event: input.event,
    correlationId: input.correlationId,
    stage: input.stage,
    hostname: input.hostname,
    forwardedHost: input.forwardedHost,
    hostMismatch: input.hostMismatch,
    hasFlowId: input.hasFlowId,
    hasPkceCookie: input.hasPkceCookie,
    ...(authError.name ? { authErrorName: authError.name } : {}),
    ...(authError.code ? { authErrorCode: authError.code } : {}),
    ...(authError.status !== undefined ? { authErrorStatus: authError.status } : {}),
  };
}

function defaultLog(payload: Record<string, unknown>): void {
  console.info(JSON.stringify(payload));
}

function failureRedirect(origin: string, correlationId: string): NextResponse {
  const errorUrl = new URL("/login", origin);
  errorUrl.searchParams.set("error", "auth_callback_failed");
  errorUrl.searchParams.set("diag", correlationId);
  return NextResponse.redirect(errorUrl);
}

export async function completeAuthCallback(
  request: NextRequest,
  deps: CompleteAuthCallbackDeps,
): Promise<NextResponse> {
  const log = deps.log ?? defaultLog;
  const randomId = deps.randomId ?? (() => crypto.randomUUID());
  const correlationId = correlationIdFromRequest(request, randomId);
  const { searchParams } = new URL(request.url);
  const next = searchParams.get("next") ?? "/app";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/app";
  const publicOrigin = resolvePublicAuthOrigin(request);
  const requestCookies = request.cookies.getAll();

  // Supabase normally appends sb_flow_id. If an allow-list/Site URL fallback
  // strips that query parameter, recover the id only when the browser carries
  // exactly one per-flow verifier cookie. Never guess between multiple flows.
  const flowId = resolvePkceFlowId(searchParams.get(PKCE_FLOW_ID_QUERY), requestCookies);
  const hasFlowId = Boolean(flowId);
  const hasPkceCookie = cookieListHasPkceVerifier(requestCookies);
  const code = searchParams.get("code")?.trim() ?? "";

  const baseLog = {
    correlationId,
    hostname: publicOrigin.hostname,
    forwardedHost: publicOrigin.forwardedHost,
    hostMismatch: publicOrigin.hostMismatch,
    hasFlowId,
    hasPkceCookie,
  };

  if (!code) {
    log(
      buildOAuthCallbackLog({
        ...baseLog,
        event: "oauth_callback_missing_code",
        stage: "missing_code",
      }),
    );
    return failureRedirect(publicOrigin.origin, correlationId);
  }

  const { error } = await deps.exchange({
    code,
    ...(flowId ? { flowId } : {}),
  });

  if (error) {
    log(
      buildOAuthCallbackLog({
        ...baseLog,
        event: "oauth_callback_exchange_failed",
        stage: "exchange_failed",
        authError: error,
      }),
    );
    return failureRedirect(publicOrigin.origin, correlationId);
  }

  await deps.acceptInvitations();
  log(
    buildOAuthCallbackLog({
      ...baseLog,
      event: "oauth_callback_session_created",
      stage: "session_created",
    }),
  );
  return NextResponse.redirect(`${publicOrigin.origin}${safeNext}`);
}
