/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const SUPABASE_HOST = 'zvyargbnvccdqgmtytck.supabase.co'

// Strict CSP: the app itself, Plaid Link and Supabase only. frame-ancestors is ignored in a <meta> CSP,
// so clickjacking is handled in main.tsx (refuse to render inside a frame).
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.plaid.com",
  "style-src 'self'",
  "img-src 'self' data: https://*.plaid.com",
  "font-src 'self'",
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST} https://*.plaid.com`,
  'frame-src https://cdn.plaid.com https://*.plaid.com',
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ')

function securityHeaders(): Plugin {
  return {
    name: 'davey-security-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!-- security-meta -->',
        `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n    <meta name="referrer" content="strict-origin-when-cross-origin">`,
      )
    },
  }
}

export default defineConfig({
  base: '/app/',
  plugins: [react(), securityHeaders()],
  build: {
    outDir: '../app',
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
})
