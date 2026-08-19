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

export function toLoginErrorMessage(): string {
  return LOGIN_INVALID_CREDENTIALS;
}
