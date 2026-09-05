export type GoogleOAuthReturnTo = "agenda" | "settings";

export function parseGoogleOAuthReturnTo(value: unknown): GoogleOAuthReturnTo {
  return value === "settings" ? "settings" : "agenda";
}

export function googleOAuthReturnPath(
  returnTo: GoogleOAuthReturnTo,
  status: "connected" | "error",
  detail?: string,
): string {
  const path = returnTo === "settings" ? "/app/settings" : "/app/agenda";
  const params = new URLSearchParams();
  if (returnTo === "settings") {
    params.set("tab", "integrations");
  }
  params.set("google", status);
  if (detail) {
    params.set("google_detail", detail);
  }
  return `${path}?${params.toString()}`;
}

/**
 * Returns the origin where the authenticated app session started OAuth.
 * The value itself comes from signed state, but we still constrain it to
 * hosts that can legitimately run this app: the canonical origin, Vercel
 * preview origins, or loopback during local development.
 */
export function parseGoogleOAuthReturnOrigin(
  value: unknown,
  canonicalAppUrl: string,
): string {
  const canonicalOrigin = new URL(canonicalAppUrl).origin;
  if (typeof value !== "string" || !value.trim()) {
    return canonicalOrigin;
  }

  let candidate: URL;
  try {
    candidate = new URL(value);
  } catch {
    return canonicalOrigin;
  }

  if (candidate.origin === canonicalOrigin) {
    return canonicalOrigin;
  }

  const hostname = candidate.hostname.toLowerCase();
  if (candidate.protocol === "https:" && hostname.endsWith(".vercel.app")) {
    return candidate.origin;
  }

  if (
    candidate.protocol === "http:" &&
    (hostname === "localhost" || hostname === "127.0.0.1")
  ) {
    return candidate.origin;
  }

  return canonicalOrigin;
}

/**
 * Operator-facing copy for Calendar OAuth callback outcomes.
 * Never dump tokens or raw Google payloads.
 */
export function googleOAuthCallbackMessage(
  status: "connected" | "error",
  detail: string | undefined,
  redirectUri?: string,
): string {
  if (status === "connected") {
    return "Google Calendar conectado com sucesso.";
  }

  switch (detail) {
    case "access_denied":
      return "A autorização no Google foi cancelada. Nada foi alterado.";
    case "token_exchange_failed":
      return "O Google recusou a troca do código. Confira Client ID, Client Secret e o URI de retorno cadastrado no Google Cloud.";
    case "missing_code_or_state":
      return "O Google não devolveu o código de autorização. Tente conectar de novo.";
    case "invalid_env":
      return "Faltam variáveis do Google Calendar neste ambiente (Client ID, Secret ou chave de criptografia).";
    case "invalid_state":
    case "malformed":
    case "signature_mismatch":
      return "A sessão de conexão foi invalidada. Tente conectar de novo.";
    case "expired":
      return "A autorização demorou demais. Tente conectar de novo.";
    case "state_user_mismatch":
      return "A conta logada no VirgíniaPsi não é a mesma que iniciou a conexão. Entre de novo e conecte.";
    default:
      break;
  }

  if (redirectUri) {
    return `Não foi possível conectar o Google Calendar. O endereço de retorno da Agenda é diferente do login. Cadastre no Google Cloud: ${redirectUri}`;
  }
  return "Não foi possível conectar o Google Calendar. Cadastre no Google Cloud o endereço deste site com /api/integrations/google/callback — é o retorno da Agenda, diferente do login.";
}
