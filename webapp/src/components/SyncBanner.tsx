import { Link } from 'react-router-dom'
import { useData } from '../lib/DataProvider'

/** Shows bank sync progress and any bank that failed to sync. */
export function SyncBanner() {
  const { progress, syncErrors, error } = useData()
  if (progress && progress.total > 0) {
    return (
      <p className="sync-banner" role="status">
        <span className="spinner small-spinner" aria-hidden /> Updating from your banks… {progress.done} of {progress.total}
      </p>
    )
  }
  if (error) return <p className="sync-banner bad" role="alert">{error}</p>
  if (syncErrors.length) {
    return (
      <p className="sync-banner bad" role="alert">
        {syncErrors.length === 1 ? `${syncErrors[0].institution} didn't update: ${syncErrors[0].message}` : `${syncErrors.length} banks didn't update.`}{' '}
        <Link to="/accounts">Fix it</Link>
      </p>
    )
  }
  return null
}
