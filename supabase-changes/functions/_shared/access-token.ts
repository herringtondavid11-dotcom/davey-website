// Update mode (Reconnect) needs the Item's Plaid access token. Davey stores these encrypted (AES-256, see the
// privacy policy), and the decrypt helper lives in the iOS repo's existing functions (plaid-sync uses it).
//
// WIRE THIS UP before deploying update mode: replace the body of `decryptAccessToken` with a call to the existing
// helper. Until then it throws, plaid-link-token returns a normal token WITHOUT mode:'update', and the web app
// stops with "Reconnect in the Davey app for now" — so nothing breaks and no duplicate Items are created.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export async function decryptAccessToken(_stored: string): Promise<string> {
  throw new Error('decryptAccessToken not wired: import the helper plaid-sync uses')
}

/** Returns the access token for an Item the user owns, or null. Table/column names are configurable. */
export async function accessTokenForItem(admin: SupabaseClient, userId: string, itemId: string): Promise<string | null> {
  const table = Deno.env.get('PLAID_ITEMS_TABLE') ?? 'plaid_items'
  const itemColumn = Deno.env.get('PLAID_ITEM_ID_COLUMN') ?? 'plaid_item_id'
  const tokenColumn = Deno.env.get('PLAID_ACCESS_TOKEN_COLUMN') ?? 'access_token'
  const ownerColumn = Deno.env.get('PLAID_ITEMS_OWNER_COLUMN') ?? 'user_id'
  const { data, error } = await admin.from(table).select(tokenColumn).eq(itemColumn, itemId).eq(ownerColumn, userId).maybeSingle()
  if (error || !data) return null
  const stored = String((data as Record<string, unknown>)[tokenColumn] ?? '')
  if (!stored) return null
  return stored.startsWith('access-') ? stored : await decryptAccessToken(stored)
}
