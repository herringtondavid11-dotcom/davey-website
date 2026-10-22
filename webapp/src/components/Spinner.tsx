export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <div className="spinner" />
      <span className="visually-hidden">{label}</span>
    </div>
  )
}

export function FullPageSpinner() {
  return (
    <div className="auth-wrap">
      <Spinner />
    </div>
  )
}
