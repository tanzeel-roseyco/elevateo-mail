import { useStore } from 'zustand'
import { live } from '@/data/http/instance'
import { Button } from '@/ui/Button'
import { createInboxNotifications } from './inboxNotifications'

// AIDEV-NOTE: Browser permission is requested only by the button; OS text deliberately contains no email details.
const notifications = createInboxNotifications(live.store, typeof Notification === 'undefined' ? null : {
  requestPermission: () => Notification.requestPermission(),
  show: () => new Notification('Elevateo Mail', { body: 'New inbox mail is available. Open Elevateo Mail to read it.', tag: 'elevateo-inbox' }),
})
export function InboxNotifications() {
  const state = useStore(notifications.store)
  return <div className="space-y-1">
    <Button disabled={state.pending} onClick={() => state.enabled ? notifications.disable() : void notifications.enable()}>
      {state.pending ? 'Requesting permission…' : state.enabled ? 'Turn off inbox notifications' : 'Enable inbox notifications'}
    </Button>
    <p className="text-xs text-muted">{state.enabled ? 'On for this session. ' : ''}New Gmail arrivals are checked when mailbox data refreshes. Keep this tab open.</p>
    {state.error && <p role="alert" className="text-xs text-muted">{state.error}</p>}
  </div>
}
