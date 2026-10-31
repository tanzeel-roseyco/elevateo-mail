import { usePwaStatus } from './lifecycle'
import { Callout } from '@/ui/Callout'
import { InstallApp } from './InstallApp'
import { useConnectivity } from '@/ui/ConnectivityBanner'

// AIDEV-NOTE: Also visible before authentication; offline bootstrap cannot reach the protected shell banner.
export function PwaFrame() {
  const status = usePwaStatus()
  const { state } = useConnectivity()
  return <>
    <InstallApp />
    {state === 'offline' && <Callout variant="brand-outline" role="status">You are offline. Only the app shell is available. Mail and attachments are not stored offline. Saves and approvals need a connection; nothing is queued. Keep this window open to retain unsaved edits.</Callout>}
    {status === 'waiting' && <Callout variant="brand-outline" role="status" label="App update">An app update is ready. Save your drafts and resolve any pending approval, then close all Elevateo Mail tabs and app windows. Reopen to use the update. This window will not reload automatically.</Callout>}
    {status === 'error' && state !== 'offline' && <Callout variant="brand-outline" role="status">Offline setup or the update check could not finish. You can keep using the website online; reopen it when your connection is stable.</Callout>}
  </>
}
