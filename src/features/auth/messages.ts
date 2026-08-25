/**
 * Maps Supabase Auth error messages to safe, generic PT-BR copy.
 *
 * Password recovery must never reveal whether an account exists, so the
 * recovery flow always shows the same confirmation regardless of the
 * underlying Supabase response. Login errors stay intentionally generic.
 */
export const AUTH_GENERIC_ERROR =
  "Não foi possível concluir a solicitação. Verifique os dados e tente novamente.";

export const LOGIN_INVALID_CREDENTIALS =
  "E-mail ou senha inválidos. Verifique os dados e tente novamente.";

export const RECOVERY_CONFIRMATION_MESSAGE =
  "Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha em instantes.";

export const GOOGLE_AUTH_UNAVAILABLE =
  "O login com Google ainda não está ligado neste ambiente.";

export const GOOGLE_AUTH_REDIRECT_DENIED =
  "O Google recusou o retorno ao VirgíniaPsi. No Google Cloud, o endereço de redirecionamento precisa ser o callback do Supabase, não o do site.";

export const AUTH_CALLBACK_FAILED =
  "Não foi possível concluir o login com Google. Se a tela do Google mostrou erro 400, o endereço de retorno ainda não está cadastrado no Google Cloud.";

export function toLoginErrorMessage(): string {
  return LOGIN_INVALID_CREDENTIALS;
}

export function toGoogleAuthErrorMessage(message: string | undefined): string {
  const haystack = (message ?? "").toLowerCase();
  if (
    haystack.includes("not enabled") ||
    haystack.includes("unsupported provider")
  ) {
    return GOOGLE_AUTH_UNAVAILABLE;
  }
  if (
    haystack.includes("redirect") &&
    (haystack.includes("not allowed") ||
      haystack.includes("allow list") ||
      haystack.includes("whitelist"))
  ) {
    return GOOGLE_AUTH_REDIRECT_DENIED;
  }
  return AUTH_GENERIC_ERROR;
}

export function toAuthQueryErrorMessage(code: string | null): string | null {
  if (!code) {
    return null;
  }
  if (code === "auth_callback_failed" || code === "auth_callback_missing_code") {
    return AUTH_CALLBACK_FAILED;
  }
  return AUTH_GENERIC_ERROR;
}
