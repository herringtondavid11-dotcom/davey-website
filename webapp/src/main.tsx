import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/plus-jakarta-sans/latin-700.css'
import '@fontsource/plus-jakarta-sans/latin-800.css'
import './styles/app.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { registerPwa } from './lib/pwa'
import { applyTheme, readTheme } from './lib/theme'

// frame-ancestors can't be set from a <meta> CSP: refuse to render inside another site's frame.
if (window.top !== window.self) {
  document.body.textContent = 'Davey can only be opened directly at daveypersonalfinance.com/app.'
} else {
  // GitHub Pages fallback: the root 404.html sends unknown /app/* paths here as /app/?p=<path>.
  const p = new URLSearchParams(window.location.search).get('p')
  if (p && p.startsWith('/')) window.history.replaceState(null, '', '/app' + p)

  // After a deploy, an open tab may ask for a screen chunk that no longer exists: reload once to get the new build.
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault()
    try {
      if (sessionStorage.getItem('davey.reloaded') === '1') return
      sessionStorage.setItem('davey.reloaded', '1')
    } catch {
      /* ignore */
    }
    window.location.reload()
  })
  window.addEventListener('load', () => setTimeout(() => { try { sessionStorage.removeItem('davey.reloaded') } catch { /* ignore */ } }, 10_000))
  applyTheme(readTheme())
  registerPwa()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
