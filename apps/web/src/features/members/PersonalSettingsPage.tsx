// Settings › Profile › Personal Details: the real V2 display-name preference (get/update with a
// revision check). Rendered inside the settings tabs; SettingsLayout owns the breadcrumb and
// page header, so this page renders only the form card.
import { useCallback, useEffect, useId, useState } from 'react'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useFeatureGateways } from '@/app/featureGateways'
import { useSession } from '@/app/session'
import { createV2Gateway } from '@/data/v2Gateway'
import { GatewayError } from '@/data/errors'
import { Button } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { EmptyState, ErrorState, Skeleton } from '@/ui/Async'
import { Field, TextInput } from '@/ui/Field'
import { Card } from '@/ui/Card'

// AIDEV-NOTE: Production uses this real HTTP port; demo/fixture entries inject a simulated one
// through featureGateways.preferences so the capture renders fixture data with no failed requests.
const realPreferencesGateway = createV2Gateway()
type Preference = { display_name: string | null; revision: number }
type View =
  | { status: 'loading'; key: string }
  | { status: 'ready'; key: string; value: Preference }
  | { status: 'denied' | 'error'; key: string }

function validName(value: string): boolean {
  return value.length <= 256 && (value.length === 0 || (value.trim().length > 0 && !/[\p{Cc}]/u.test(value)))
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <section aria-label="Personal settings">
      <Card className="max-w-lg">{children}</Card>
    </section>
  )
}

/** Session-owned preferences are loaded fresh for every actor and authorization context. */
export function PersonalSettingsPage() {
  const { state } = useSession()
  const { request, proof } = useProtectedRequest()
  const gateway = useFeatureGateways().preferences ?? realPreferencesGateway
  const session = state.status === 'ready' ? state.session : null
  const key = session ? `${session.actor.id}:${session.organization.id}:${session.context_id}:${session.authorization_version}` : null
  const [view, setView] = useState<View | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [writeBlocked, setWriteBlocked] = useState(false)
  const inputId = useId()

  const load = useCallback(async () => {
    if (!key || !session) return
    setView({ status: 'loading', key })
    setNotice(null)
    setWriteBlocked(false)
    const outcome = await request((ctx, signal) => gateway.getUserDisplayPreference(ctx, signal))
    if (outcome.kind === 'stale') return
    if (outcome.kind === 'failed') {
      const denied =
        outcome.error instanceof GatewayError &&
        outcome.error.kind === 'api' &&
        (outcome.error.status === 403 || outcome.error.status === 404 || outcome.error.code === 'not_available')
      setView({ status: denied ? 'denied' : 'error', key })
      return
    }
    if (outcome.value.context_id !== session.context_id || outcome.value.authorization_version !== session.authorization_version) {
      setView({ status: 'error', key })
      return
    }
    setName(outcome.value.display_name ?? '')
    setView({ status: 'ready', key, value: outcome.value })
  }, [gateway, key, request, session])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    if (!key || !proof || view?.status !== 'ready' || view.key !== key || saving || writeBlocked) return
    if (!validName(name)) {
      setNotice({ tone: 'danger', text: 'Display name must be 1–256 characters without control characters, or empty to clear.' })
      return
    }
    setSaving(true)
    setNotice(null)
    const outcome = await request((ctx, signal) =>
      gateway.updateUserDisplayPreference({ display_name: name === '' ? null : name, expected_revision: view.value.revision }, ctx, proof, signal),
    )
    setSaving(false)
    if (outcome.kind === 'stale') return
    if (outcome.kind === 'failed') {
      if (outcome.error instanceof GatewayError && outcome.error.kind === 'api' && outcome.error.status === 409) {
        setWriteBlocked(true)
        setNotice({ tone: 'danger', text: 'Your settings changed. Reload current settings before saving again.' })
      } else if (
        outcome.error instanceof GatewayError &&
        outcome.error.kind === 'api' &&
        (outcome.error.status === 403 || outcome.error.status === 404 || outcome.error.code === 'not_available')
      ) {
        setView({ status: 'denied', key })
      } else setNotice({ tone: 'danger', text: 'Settings could not be saved. Check the current value before retrying.' })
      return
    }
    setName(outcome.value.display_name ?? '')
    setView({ status: 'ready', key, value: outcome.value })
    setNotice({ tone: 'success', text: 'Display name saved.' })
  }

  // Explains the disabled Save button: whitespace-only or control characters are refused locally.
  const nameError = validName(name) ? null : 'Use visible characters only (up to 256), or clear the field to remove the name.'
  if (!session || !key) return <Frame><EmptyState title="Personal settings unavailable" body="Your current session could not be verified." /></Frame>
  if (!view || view.key !== key || view.status === 'loading') return <Frame><div role="status" aria-label="Loading personal settings" className="max-w-md"><Skeleton rows={3} /></div></Frame>
  if (view.status === 'denied') return <Frame><EmptyState title="Personal settings unavailable" body="Your current session cannot access these settings." /></Frame>
  if (view.status === 'error') return <Frame><ErrorState title="Personal settings could not be loaded" body="Try again after checking your connection." action={<Button variant="primary" onClick={() => void load()}>Retry</Button>} /></Frame>
  return (
    <Frame>
      <form
        className="max-w-md space-y-6"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <Field id={inputId} label="Display name" hint="Clear the field to remove your display name." error={nameError}>
          <TextInput id={inputId} value={name} maxLength={256} onChange={(event) => setName(event.target.value)} disabled={saving || writeBlocked} autoComplete="name" aria-invalid={nameError ? true : undefined} aria-describedby={nameError ? `${inputId}-hint ${inputId}-error` : `${inputId}-hint`} />
        </Field>
        {notice && <Callout variant={notice.tone} role="status">{notice.text}</Callout>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" loading={saving} disabled={writeBlocked || !validName(name)}>Save display name</Button>
          <Button type="button" onClick={() => void load()} disabled={saving}>Reload settings</Button>
        </div>
        <p className="text-sm text-muted">Signed in as {session.actor.display_name ?? 'Unnamed user'}. Mailbox access follows your current memberships and server permissions.</p>
        <p className="text-sm text-muted">Timezone, credentials and notification preferences are unavailable in this build.</p>
      </form>
    </Frame>
  )
}
