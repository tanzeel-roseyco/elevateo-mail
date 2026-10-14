import { useCallback, useEffect, useState } from 'react'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useSession } from '@/app/session'
import { createV2Gateway } from '@/data/v2Gateway'
import { GatewayError } from '@/data/errors'
import { Button } from '@/ui/Button'
import { EmptyState, Skeleton } from '@/ui/Async'

const gateway = createV2Gateway()
type Preference = { display_name: string | null; revision: number }
type View =
  | { status: 'loading'; key: string }
  | { status: 'ready'; key: string; value: Preference }
  | { status: 'denied' | 'error'; key: string }

function validName(value: string): boolean {
  return value.length <= 256 && (value.length === 0 || (value.trim().length > 0 && !/[\p{Cc}]/u.test(value)))
}

/** Session-owned preferences are loaded fresh for every actor and authorization context. */
export function PersonalSettingsPage() {
  const { state } = useSession()
  const { request, proof } = useProtectedRequest()
  const session = state.status === 'ready' ? state.session : null
  const key = session ? `${session.actor.id}:${session.organization.id}:${session.context_id}:${session.authorization_version}` : null
  const [view, setView] = useState<View | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [writeBlocked, setWriteBlocked] = useState(false)

  const load = useCallback(async () => {
    if (!key || !session) return
    setView({ status: 'loading', key })
    setNotice(null)
    setWriteBlocked(false)
    const outcome = await request((ctx, signal) => gateway.getUserDisplayPreference(ctx, signal))
    if (outcome.kind === 'stale') return
    if (outcome.kind === 'failed') {
      const denied = outcome.error instanceof GatewayError && outcome.error.kind === 'api' &&
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
  }, [key, request, session])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!key || !proof || view?.status !== 'ready' || view.key !== key || saving || writeBlocked) return
    if (!validName(name)) { setNotice('Display name must be 1–256 characters without control characters, or empty to clear.'); return }
    setSaving(true)
    setNotice(null)
    const outcome = await request((ctx, signal) => gateway.updateUserDisplayPreference(
      { display_name: name === '' ? null : name, expected_revision: view.value.revision }, ctx, proof, signal,
    ))
    setSaving(false)
    if (outcome.kind === 'stale') return
    if (outcome.kind === 'failed') {
      if (outcome.error instanceof GatewayError && outcome.error.kind === 'api' && outcome.error.status === 409) {
        setWriteBlocked(true)
        setNotice('Your settings changed. Reload current settings before saving again.')
      } else if (outcome.error instanceof GatewayError && outcome.error.kind === 'api' &&
        (outcome.error.status === 403 || outcome.error.status === 404 || outcome.error.code === 'not_available')) {
        setView({ status: 'denied', key })
      } else setNotice('Settings could not be saved. Check the current value before retrying.')
      return
    }
    setName(outcome.value.display_name ?? '')
    setView({ status: 'ready', key, value: outcome.value })
    setNotice('Display name saved.')
  }

  if (!session || !key) return <EmptyState title="Personal settings unavailable" body="Your current session could not be verified." />
  if (!view || view.key !== key || view.status === 'loading') return <Skeleton />
  if (view.status === 'denied') return <EmptyState title="Personal settings unavailable" body="Your current session cannot access these settings." />
  if (view.status === 'error') return <EmptyState title="Personal settings could not be loaded" body="Try again after checking your connection." action={<Button onClick={() => void load()}>Retry</Button>} />
  return <section className="mx-auto max-w-2xl p-4" aria-label="Personal settings">
    <h1 className="text-xl font-semibold">Personal settings</h1>
    <p className="mt-2 text-sm text-muted">Signed in as {session.actor.display_name ?? 'Unnamed user'}.</p>
    <label htmlFor="personal-display-name" className="mt-4 block text-sm font-medium">Display name</label>
    <input id="personal-display-name" className="mt-1 w-full rounded border p-2" value={name} maxLength={256} onChange={(event) => setName(event.target.value)} disabled={saving || writeBlocked} />
    <p className="mt-1 text-sm text-muted">Clear the field to remove your display name.</p>
    {notice && <p role="status" className="mt-2 text-sm">{notice}</p>}
    <div className="mt-3 flex gap-2"><Button onClick={() => void save()} disabled={saving || writeBlocked || !validName(name)}>Save display name</Button>
      <Button onClick={() => void load()} disabled={saving}>Reload settings</Button></div>
    <p className="mt-4 text-sm">Account recovery and sign-out are available from the account menu. Mailbox access follows your current memberships and server permissions.</p>
    <p className="mt-2 text-sm text-muted">Timezone, credentials and notification preferences are unavailable in this build.</p>
  </section>
}
