// AES-256-GCM encryption for Plaid access tokens at rest.
// Format: "v1:" + base64(12-byte IV || ciphertext+tag). The key is PLAID_TOKEN_ENCRYPTION_KEY,
// 32 random bytes in base64, stored only as a Supabase secret.

const VERSION = "v1";

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = decodeBase64(base64Key);
  if (raw.length !== 32) throw new Error("PLAID_TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

let cachedKey: Promise<CryptoKey> | undefined;

function key(): Promise<CryptoKey> {
  if (!cachedKey) {
    const value = Deno.env.get("PLAID_TOKEN_ENCRYPTION_KEY");
    if (!value) throw new Error("Missing PLAID_TOKEN_ENCRYPTION_KEY");
    cachedKey = importKey(value);
  }
  return cachedKey;
}

export async function encrypt(plaintext: string, cryptoKey?: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey ?? await key(), new TextEncoder().encode(plaintext)),
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv);
  combined.set(ciphertext, iv.length);
  return `${VERSION}:${encodeBase64(combined)}`;
}

export async function decrypt(value: string, cryptoKey?: CryptoKey): Promise<string> {
  const [version, payload] = value.split(":", 2);
  if (version !== VERSION || !payload) throw new Error("Unrecognized ciphertext format");
  const combined = decodeBase64(payload);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: combined.slice(0, 12) },
    cryptoKey ?? await key(),
    combined.slice(12),
  );
  return new TextDecoder().decode(plaintext);
}
