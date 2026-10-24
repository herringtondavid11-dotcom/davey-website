// Deployed entrypoint for plaid-webhook (verify_jwt false).
// Loads the esbuild bundle from the pinned commit and refuses to start if the hash changes.
const SHA = "4414e299a56c242587d04d70491bce588918dcad";
const BUNDLE = `https://raw.githubusercontent.com/herringtondavid11-dotcom/davey-website/${SHA}/supabase-changes/functions/plaid-webhook.bundle.js`;
const EXPECT = "99f6c170f333fee93bac15928e65665e53db9e9638435e73ad3483e0c12a515b";
const response = await fetch(BUNDLE);
if (!response.ok) throw new Error("bundle fetch failed");
const src = await response.text();
const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(src));
const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
if (hex !== EXPECT) throw new Error("bundle hash mismatch");
new Function(src)();
