# Davey on the web (`/app`)

React + TypeScript + Vite. Source here, build output in `../app` (served by GitHub Pages at https://daveypersonalfinance.com/app).

```bash
npm ci
npm run dev        # http://localhost:5173/app/ (no CSP in dev)
npm test           # Vitest unit tests
npm run build      # typecheck + build to ../app + per-route pages + CSP checks
npm run e2e        # Playwright against ../ served like GitHub Pages, mocked Supabase/Plaid; screenshots → screenshots/
```

Always run `npm run build` and commit `../app` after changing anything here. See `../WEB-PHASE1.md`.
