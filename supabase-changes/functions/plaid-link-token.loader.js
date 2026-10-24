// Deployed entrypoint for plaid-link-token (verify_jwt false).
// The static import registers the certificate package the bundle needs.
// The bundle itself is loaded from the pinned commit and rejected if the hash changes.
import * as x509 from "npm:@peculiar/x509@1.12.3";
void x509;
const SHA = "4414e299a56c242587d04d70491bce588918dcad";
const BUNDLE = `https://raw.githubusercontent.com/herringtondavid11-dotcom/davey-website/${SHA}/supabase-changes/functions/plaid-link-token.bundle.js`;
const EXPECT = "7d1f52cda87a9ef26750cecdfa022d92ffbc0757f89eca40238a13a2a3c8da09";
const response = await fetch(BUNDLE);
if (!response.ok) throw new Error("bundle fetch failed");
const src = await response.text();
const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(src));
const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
if (hex !== EXPECT) throw new Error("bundle hash mismatch");
await import("data:text/javascript," + encodeURIComponent(src));
