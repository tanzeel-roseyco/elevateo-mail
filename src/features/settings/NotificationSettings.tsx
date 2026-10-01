import { Info } from 'lucide-react'
import { useState } from 'react'
import { useData } from '@/data/store'
import { Badge } from '@/ui/Badge'
import { Callout } from '@/ui/Bits'
import { Button } from '@/ui/Button'
import { Switch } from '@/ui/Field'
import { toast } from '@/ui/toast'

type Permission = NotificationPermission | 'unsupported'

const PERMISSION_TEXT: Record<Permission, string> = {
  granted: 'Allowed by this browser',
  denied: 'Blocked by this browser. Change it in the browser’s site settings.',
  default: 'Not yet requested',
  unsupported: 'This browser does not support notifications',
}

export function NotificationSettings() {
  const prefs = useData((s) => s.settings.notifications)
  const updateSettings = useData((s) => s.updateSettings)
  const [permission, setPermission] = useState<Permission>(() => ('Notification' in window ? Notification.permission : 'unsupported'))
  const set = (patch: Partial<typeof prefs>) => updateSettings({ notifications: { ...prefs, ...patch } })

  return (
    <div className="mt-4 flex flex-col gap-6">
      <section aria-labelledby="in-app" className="flex flex-col gap-4">
        <div>
          <h3 id="in-app" className="text-base font-semibold">
            In-app notifications
          </h3>
          <p className="text-[13px] text-muted">Controls what appears under the bell icon. Changes save immediately.</p>
        </div>
        <Switch label="Replies" description="A contact replies to any of your addresses." checked={prefs.replies} onChange={(replies) => set({ replies })} />
        <Switch label="Delivery failures" description="A message bounces or fails to send." checked={prefs.failures} onChange={(failures) => set({ failures })} />
        <Switch label="Campaign completion" description="A campaign finishes sending to all recipients." checked={prefs.completion} onChange={(completion) => set({ completion })} />
      </section>

      <section aria-labelledby="browser-permission" className="flex flex-col gap-3 border-t border-line pt-5">
        <h3 id="browser-permission" className="text-base font-semibold">
          Browser notification permission
        </h3>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={permission === 'granted' ? 'success' : permission === 'denied' ? 'danger' : 'neutral'}>{permission === 'default' ? 'Not requested' : permission[0]?.toUpperCase() + permission.slice(1)}</Badge>
          {PERMISSION_TEXT[permission]}
        </p>
        {permission === 'default' && (
          <div>
            <Button onClick={() => void Notification.requestPermission().then(setPermission).catch(() => toast('The browser blocked the permission request.', { tone: 'error' }))}>Ask the browser for permission</Button>
          </div>
        )}
        <Callout tone="info" icon={Info}>
          This is separate from the preferences above. Your preferences decide what the mailroom would notify you about; the browser decides whether it may show desktop alerts. The prototype shows in-app notifications only and never sends desktop alerts.
        </Callout>
      </section>
    </div>
  )
}
