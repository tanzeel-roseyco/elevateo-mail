// Settings › Webhooks (EmailGuard "Webhook URLs"): list with "Add New Webhook" and the "No webhook
// URLs yet" empty state, plus the create form. No registration or delivery endpoint exists in this
// build: production shows the unavailable state; demo/dev-fixture entries keep the labelled
// simulated adapter, and nothing is ever called.
import { useId, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'
import { formatDateTime } from '@/lib/format'
import { EmptyState } from '@/ui/Async'
import { Badge } from '@/ui/Badge'
import { Button, buttonClass } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { CheckboxField, Field, TextInput } from '@/ui/Field'
import { BoltIcon, PlusIcon } from '@/ui/icons'
import { useToast } from '@/ui/Toast'
import { SimulatedAdapterNotice } from './SettingsLayout'
import { simulatedId, useSimulatedStore } from './simulatedStore'
import { UnavailableSetting, useSimulatedSettings } from './UnavailableSetting'

export const WEBHOOK_EVENTS = [
  { key: 'conversation.received', label: 'Conversation received' },
  { key: 'draft.saved', label: 'Draft saved' },
  { key: 'send.approved', label: 'Send approved' },
  { key: 'send.completed', label: 'Send completed' },
  { key: 'campaign.run.finished', label: 'Campaign run finished' },
] as const
type EventKey = (typeof WEBHOOK_EVENTS)[number]['key']
const EVENT_KEYS = WEBHOOK_EVENTS.map((event) => event.key) as [EventKey, ...EventKey[]]

const WebhookSchema = z.object({
  id: z.string().min(1),
  url: z.string().url().max(2048).refine((value) => value.startsWith('https://'), 'HTTPS only'),
  events: z.array(z.enum(EVENT_KEYS)).min(1),
  created_at: z.string(),
})
type Webhook = z.infer<typeof WebhookSchema>
/** Hard limit of the adapter; a full list refuses new endpoints instead of evicting old ones. */
export const WEBHOOK_LIMIT = 50
const WebhooksSchema = z.array(WebhookSchema).max(WEBHOOK_LIMIT)
const NO_WEBHOOKS: readonly Webhook[] = []

function useWebhooks() {
  return useSimulatedStore<readonly Webhook[]>('webhooks', WebhooksSchema, NO_WEBHOOKS)
}

const WEBHOOKS_UNAVAILABLE = (
  <UnavailableSetting
    icon={<BoltIcon className="size-5" />}
    title="Webhooks are not available yet"
    body="Registering an endpoint needs a server-side dispatcher that this release does not include, so no URL can be saved or called. The Developer API page lists what the gateway exposes today."
    action={{ to: '/settings/developer-api', label: 'Developer API' }}
  />
)

export function WebhooksPage() {
  if (!useSimulatedSettings()) return WEBHOOKS_UNAVAILABLE
  return <SimulatedWebhooksPage />
}

function SimulatedWebhooksPage() {
  const store = useWebhooks()
  const { toast } = useToast()
  const remove = (hook: Webhook) => {
    store.update((current) => current.filter((h) => h.id !== hook.id))
    toast('Webhook removed.', 'neutral')
  }
  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-base font-medium text-fg ">Endpoints</h2>
        <Link to="/settings/webhooks/create" className={buttonClass('primary', 'xs')}><PlusIcon className="size-4" />Add New Webhook</Link>
      </div>
      <SimulatedAdapterNotice>Endpoints registered here are never called. Delivery requires a server-side dispatcher that this build does not include.</SimulatedAdapterNotice>
      <div className="max-w-3xl">
        {store.value.length === 0 ? (
          <EmptyState icon={<BoltIcon className="size-5" />} title="No webhook URLs yet" body="After creating webhook URLs, you'll be able to see and manage all of your webhooks here." action={<Link to="/settings/webhooks/create" className={buttonClass('primary', 'md')}>Add New Webhook</Link>} />
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-line " aria-label="Webhook URLs">
              {store.value.map((hook) => (
                <li key={hook.id} className="flex flex-wrap items-center gap-3 px-6 py-4 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-fg ">{hook.url}</p>
                    <p className="mt-1 flex flex-wrap gap-1">{hook.events.map((event) => <Badge key={event} tone="neutral" size="sm">{event}</Badge>)}</p>
                    <p className="mt-1 text-xs text-muted">Registered {formatDateTime(hook.created_at)}</p>
                  </div>
                  <Badge tone="warn" size="sm">Simulated · never called</Badge>
                  <Button size="sm" variant="danger" onClick={() => remove(hook)}>Remove</Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  )
}

export function WebhookCreatePage() {
  if (!useSimulatedSettings()) return WEBHOOKS_UNAVAILABLE
  return <SimulatedWebhookCreatePage />
}

function SimulatedWebhookCreatePage() {
  const store = useWebhooks()
  const navigate = useNavigate()
  const { toast } = useToast()
  const id = useId()
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<readonly EventKey[]>(['conversation.received'])
  const [error, setError] = useState<string | null>(null)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const toggle = (key: EventKey, on: boolean) => setEvents((before) => (on ? [...before, key] : before.filter((e) => e !== key)))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    // Each problem is reported on the control it belongs to (URL field or event fieldset).
    const urlCheck = WebhookSchema.shape.url.safeParse(url.trim())
    const urlError = urlCheck.success ? null : 'Enter a valid https:// URL.'
    const eventError = events.length === 0 ? 'Choose at least one event.' : null
    setError(urlError)
    setEventsError(eventError)
    if (!urlCheck.success || eventError !== null) return
    const record: Webhook = { id: simulatedId(), url: urlCheck.data, events: [...events], created_at: new Date().toISOString() }
    let refused: string | null = null
    store.update((current) => {
      if (current.some((hook) => hook.url === record.url)) {
        refused = 'That URL is already registered.'
        return null
      }
      if (current.length >= WEBHOOK_LIMIT) {
        refused = `This workspace already has ${WEBHOOK_LIMIT} webhook URLs. Remove one before adding another.`
        return null
      }
      return [...current, record]
    })
    if (refused !== null) {
      setError(refused)
      return
    }
    toast('Webhook recorded in this browser only.', 'neutral')
    void navigate('/settings/webhooks')
  }
  return (
    <>
      <SimulatedAdapterNotice />
      <Card className="max-w-lg">
        <form className="space-y-6" onSubmit={submit} noValidate>
          <Field id={`${id}-url`} label="Endpoint URL" hint="HTTPS only. Elevateo would POST a JSON envelope to this address." error={error}>
            <TextInput id={`${id}-url`} type="url" inputMode="url" placeholder="https://example.com/hooks/elevateo" value={url} onChange={(event) => setUrl(event.target.value)} aria-invalid={error ? true : undefined} aria-describedby={`${id}-url-hint`} />
          </Field>
          <fieldset className="space-y-2" aria-describedby={eventsError ? `${id}-events-error` : undefined} aria-invalid={eventsError ? true : undefined}>
            <legend className="mb-3 text-sm font-medium text-fg ">Events</legend>
            {/* Block wrapper per option: the label primitive is inline-flex (a `flex` override loses to it
                in Tailwind's class order), and the fieldset's space-y only separates block children. */}
            {WEBHOOK_EVENTS.map((event) => (
              <div key={event.key}>
                <CheckboxField id={`${id}-${event.key}`} label={event.label} checked={events.includes(event.key)} onChange={(change) => toggle(event.key, change.target.checked)} />
              </div>
            ))}
            {eventsError && <p id={`${id}-events-error`} role="alert" className="mt-2 text-sm font-medium text-danger">{eventsError}</p>}
          </fieldset>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={!store.writable}>Save webhook</Button>
            <Link to="/settings/webhooks" className={buttonClass('ghost', 'md')}>Cancel</Link>
          </div>
        </form>
      </Card>
    </>
  )
}
