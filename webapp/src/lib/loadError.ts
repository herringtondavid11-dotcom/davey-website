/** A failed load in Davey's words: never a raw server or network message. */
export function loadErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : ''
  if (/failed to fetch|network|load failed|networkerror/i.test(message)) return "Couldn't reach Davey. Check your connection, then try again."
  if (/jwt|expired|unauthori[sz]ed|401/i.test(message)) return 'Your session ended. Sign in again.'
  return "Couldn't load your data. Try again in a moment."
}
