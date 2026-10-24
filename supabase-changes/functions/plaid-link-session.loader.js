// Deployed entrypoint for plaid-link-session (verify_jwt false).
// Loads the esbuild bundle from the pinned commit and refuses to start if the hash changes.
const SHA = "4414e299a56c242587d04d70491bce588918dcad";
const BUNDLE = `https://raw.githubusercontent.com/herringtondavid11-dotcom/davey-website/${SHA}/supabase-changes/functions/plaid-link-session.bundle.js`;
const EXPECT = "ccfe1da523c1fb5c82a288f3bc658004ffffe6530da32a89436ff849a376c3bc";
const response = await fetch(BUNDLE);
if (!response.ok) throw new Error("bundle fetch failed");
const src = await response.text();
const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(src));
const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
if (hex !== EXPECT) throw new Error("bundle hash mismatch");
new Function(src)();
