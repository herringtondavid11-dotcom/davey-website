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
import { applyTheme, readTheme } from './lib/theme'

// frame-ancestors can't be set from a <meta> CSP: refuse to render inside another site's frame.
if (window.top !== window.self) {
  document.body.textContent = 'Davey can only be opened directly at daveypersonalfinance.com/app.'
} else {
  // GitHub Pages fallback: the root 404.html sends unknown /app/* paths here as /app/?p=<path>.
  const p = new URLSearchParams(window.location.search).get('p')
  if (p && p.startsWith('/')) window.history.replaceState(null, '', '/app' + p)

  applyTheme(readTheme())
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
