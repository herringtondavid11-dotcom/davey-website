import type { ReactNode } from 'react'

export function AuthCard({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <img src={`${import.meta.env.BASE_URL}icon-96.png`} alt="" width="36" height="36" />
          Davey
        </div>
        <div>
          <h1>{title}</h1>
          {lead && <p className="muted" style={{ marginTop: 6 }}>{lead}</p>}
        </div>
        {children}
      </div>
    </main>
  )
}
