// Feature flags shared by the app and the e2e tests (no Vite env here, so Node can import it).
/**
 * Web 2-step (a code emailed after the password). Off for now (David, 2026-10-22 4:22 PM PT): Supabase still sends its
 * default link-only email. Turn back on once the template sends a 6-digit code (AUTH-EMAIL-FIX.md). While off, a
 * correct email + password (behind the company access code) signs straight in and no sign-in email is ever sent.
 */
export const EMAIL_2FA_ENABLED = false
