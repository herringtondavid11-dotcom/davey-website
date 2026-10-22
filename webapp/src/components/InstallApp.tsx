import { useEffect, useState } from 'react'
import { canPromptInstall, isIosSafari, isStandalone, onInstallChange, promptInstall } from '../lib/pwa'

export function InstallApp() {
  const [, force] = useState(0)
  useEffect(() => {
    const off = onInstallChange(() => force((n) => n + 1))
    return () => void off()
  }, [])
  if (isStandalone()) return <p className="muted">Davey is installed on this device.</p>
  if (canPromptInstall()) return <button className="btn btn-secondary" onClick={() => promptInstall()}>Install Davey</button>
  if (isIosSafari()) return <p className="muted">In Safari, tap Share, then <b>Add to Home Screen</b>.</p>
  return <p className="muted">Use your browser's menu to install Davey (Chrome and Edge: the install icon in the address bar; Safari on Mac: File › Add to Dock).</p>
}
