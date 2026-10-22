// Supabase Auth errors in Davey's words (the same wording as the app's AuthError).
type AuthLikeError = { status?: number; code?: string; message?: string }

export const RATE_LIMIT_MESSAGE = 'Too many emails, try again in a few minutes.'

export function authErrorMessage(error: AuthLikeError, fallback = "That didn't work. Try again."): string {
  const code = error.code ?? ''
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || error.status === 429) return RATE_LIMIT_MESSAGE
  if (code === 'same_password') return "Choose a password you haven't used for Davey before."
  if (code === 'weak_password') return 'Choose a stronger password: at least 10 characters.'
  if (code === 'otp_expired') return 'This link was already used or has expired. Request a new one.'
  return error.message || fallback
}
