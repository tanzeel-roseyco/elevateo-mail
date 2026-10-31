// Settings › Integrations › Connections (route /settings/integrations/mcp). Lets the signed-in user
// see, grant, revoke and trim the MCP connector connections that let an external AI client (Claude,
// Codex, other) read their mail and draft replies. The grant data flows through the optional
// ConnectorGrantsGateway capability: present (server support, or the simulated demo adapter) → live
// management; absent (production today) → an honest unavailable state. A static "connect a client"
// reference is shown underneath in every case.
//
// AIDEV-NOTE: contract-request — the /v2/me/connector-grants routes this screen drives do not exist
// in contracts/v1 or v2 yet (connectorGrantsContract.ts carries the full proposal). Because an AI
// client reads real mail, the "which mailbox is shared with whom" notice is first-class UI, not a
// footnote: it sits on the page, on every connection, and on every affected mailbox row.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { describeFailure } from '@/app/collaborationFailure'
import { useFeatureGateways } from '@/app/featureGateways'
import { useMailboxes } from '@/app/mailboxes'
import { useProtectedRequest } from '@/app/protectedRequest'
import type {
  ConnectorClientKind,
  ConnectorGrant,
  ConnectorGrantCreateInput,
  ConnectorGrantsGateway,
  ConnectorScope,
} from '@/data/connectorGrantsContract'
import { CONNECTOR_CLIENT_KINDS, CONNECTOR_GRANT_MAX_MAILBOXES } from '@/data/connectorGrantsContract'
import type { ReadContext } from '@/data/gateway'
import { cx, formatDateTime } from '@/lib/format'
import { EmptyState, ErrorState, Skeleton } from '@/ui/Async'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { Card } from '@/ui/Card'
import { CodeBlock } from '@/ui/CodeBlock'
import { CheckboxField, Field, Select, TextInput } from '@/ui/Field'
import { Modal } from '@/ui/Modal'
import { SectionHeader } from '@/ui/PageHeader'
import { useToast } from '@/ui/Toast'
import { CommandLineIcon, ExclamationTriangleIcon, PlusIcon } from '@/ui/icons'
import { INTEGRATIONS, PlannedConnectorNotice } from './IntegrationsPages'
import { SimulatedAdapterNotice } from './SettingsLayout'
import { UnavailableSetting, useSimulatedSettings } from './UnavailableSetting'

const CLIENT_LABELS: Record<ConnectorClientKind, string> = { claude: 'Claude', codex: 'Codex', other: 'Other assistant' }
const SCOPE_LABELS: Record<ConnectorScope, string> = { 'mailbox:read': 'Read mail', 'draft:write': 'Write drafts' }

/** Expiry presets offered in the grant dialog; `null` means the connection never expires. */
const EXPIRY_OPTIONS: ReadonlyArray<{ value: string; label: string; days: number | null }> = [
  { value: 'never', label: 'Never expires', days: null },
  { value: '7', label: 'In 7 days', days: 7 },
  { value: '30', label: 'In 30 days', days: 30 },
  { value: '90', label: 'In 90 days', days: 90 },
]

export function ConnectionsPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <ConnectionsManagement />
      <ConnectClientReference />
    </div>
  )
}

/** Grant management, or the honest unavailable state when the server exposes no connector endpoints. */
function ConnectionsManagement() {
  const { connectorGrants } = useFeatureGateways()
  if (connectorGrants === undefined) {
    return (
      <UnavailableSetting
        icon={<CommandLineIcon className="size-5" />}
        title="Connections are not available yet"
        body="Granting an AI client access to a mailbox needs a server endpoint that this release does not include, so no connection can be created or revoked. The steps below describe how a client will connect once it ships."
        action={{ to: '/settings/integrations', label: 'All integrations' }}
      />
    )
  }
  return <ConnectionsManager gateway={connectorGrants} />
}

type ListState = { status: 'loading' } | { status: 'ready'; grants: readonly ConnectorGrant[] } | { status: 'error'; message: string }

function ConnectionsManager({ gateway }: { gateway: ConnectorGrantsGateway }) {
  const { request, proof } = useProtectedRequest()
  const mailboxes = useMailboxes()
  const { toast } = useToast()
  const simulated = useSimulatedSettings()
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [params, setParams] = useSearchParams()
  const [grantOpen, setGrantOpen] = useState(false)
  const [secret, setSecret] = useState<{ clientName: string; value: string } | null>(null)
  // One confirmation at a time: revoke a whole connection, or remove one mailbox from it.
  const [confirm, setConfirm] = useState<{ kind: 'revoke'; grant: ConnectorGrant } | { kind: 'removeMailbox'; grant: ConnectorGrant; mailboxId: string } | null>(null)
  const [writeError, setWriteError] = useState<string | null>(null)
  // AIDEV-NOTE: One in-flight write owns the busy marker; a stale completion releases only its token.
  const [busy, setBusy] = useState(false)
  const writeTokenRef = useRef(0)
  // AIDEV-NOTE: session guards do not order reloads; only the newest list request may publish grants.
  const listTokenRef = useRef(0)

  const mailboxFilter = params.get('mailbox')
  const focusId = params.get('connection')

  /** Live mailbox names by id; grant rows prefer these over the server-stored fallback name. */
  const mailboxNames = useMemo(() => {
    const map = new Map<string, string>()
    if (mailboxes.status === 'ready') for (const mailbox of mailboxes.mailboxes) map.set(mailbox.id, mailbox.display_name)
    return map
  }, [mailboxes])
  const nameFor = useCallback((mailboxId: string, fallback: string) => mailboxNames.get(mailboxId) ?? fallback, [mailboxNames])

  const load = useCallback(async () => {
    const token = ++listTokenRef.current
    setList({ status: 'loading' })
    setWriteError(null)
    const outcome = await request((ctx, signal) => gateway.listConnectorGrants(ctx, signal))
    if (outcome.kind === 'stale' || listTokenRef.current !== token) return
    if (outcome.kind === 'failed') {
      setList({ status: 'error', message: describeFailure(outcome.error, 'read').message })
      return
    }
    setList({ status: 'ready', grants: outcome.value.items })
  }, [gateway, request])

  useEffect(() => {
    void load()
  }, [load])

  const setParam = (key: 'mailbox' | 'connection', value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  /** Run one guarded connector write; reloads the list on success so the view matches the server. */
  const runWrite = async (work: (ctx: ReadContext, signal: AbortSignal) => Promise<unknown>, successMessage: string): Promise<boolean> => {
    if (!proof || busy) return false
    const token = ++writeTokenRef.current
    setBusy(true)
    setWriteError(null)
    const outcome = await request((ctx, signal) => work(ctx, signal))
    if (writeTokenRef.current === token) setBusy(false)
    if (outcome.kind === 'stale') return false
    if (outcome.kind === 'failed') {
      setWriteError(describeFailure(outcome.error, 'write').message)
      return false
    }
    toast(successMessage, 'neutral')
    await load()
    return true
  }

  const createGrant = async (input: ConnectorGrantCreateInput): Promise<string | null> => {
    if (!proof) return 'You are signed out. Sign in again to grant access.'
    const token = ++writeTokenRef.current
    setBusy(true)
    setWriteError(null)
    const sessionProof = proof
    const outcome = await request((ctx, signal) => gateway.createConnectorGrant(ctx, sessionProof, input, signal))
    if (writeTokenRef.current === token) setBusy(false)
    if (outcome.kind === 'stale') return null // ownership moved on; the dialog was superseded
    if (outcome.kind === 'failed') return describeFailure(outcome.error, 'write').message
    // The secret is shown exactly once here and never requested again.
    setSecret({ clientName: outcome.value.grant.client_name, value: outcome.value.secret })
    setGrantOpen(false)
    await load()
    return null
  }

  const confirmAction = async () => {
    if (confirm === null || !proof) return
    const sessionProof = proof
    if (confirm.kind === 'revoke') {
      const grant = confirm.grant
      const ok = await runWrite((ctx, signal) => gateway.revokeConnectorGrant(ctx, sessionProof, grant.id, signal), `Connection “${grant.client_name}” revoked.`)
      if (ok && focusId === grant.id) setParam('connection', null)
    } else {
      const { grant, mailboxId } = confirm
      await runWrite((ctx, signal) => gateway.removeConnectorGrantMailbox(ctx, sessionProof, grant.id, mailboxId, signal), 'Mailbox removed from the connection.')
    }
    setConfirm(null)
  }

  const grantableMailboxes = mailboxes.status === 'ready' ? mailboxes.mailboxes : []
  const canGrant = Boolean(proof) && mailboxes.status === 'ready' && grantableMailboxes.length > 0

  return (
    <section aria-label="Connections">
      <SectionHeader
        title="Connections"
        subtitle="AI clients (Claude, Codex, other) that can read your mail and draft replies through the MCP connector."
        action={<Button variant="primary" size="xs" icon={<PlusIcon className="size-4" />} onClick={() => setGrantOpen(true)} disabled={!canGrant || busy}>Grant access</Button>}
      />

      {simulated && <SimulatedAdapterNotice>Connections shown here are simulated: no credential is accepted by any AI client and no mail is sent anywhere. This demonstrates the grant workflow.</SimulatedAdapterNotice>}

      {/* Standing, plain-language notice: granting access shares real mail content with an external AI. */}
      <Callout variant="warning" icon heading="These connections share your mail with an external AI" className="mb-6">
        A connection lets that AI client read the mail in the mailboxes you choose. When the client reads a message, its content is sent to that AI provider. Grant only the mailboxes and scopes you intend to share, and revoke a connection you no longer use.
      </Callout>

      {mailboxes.status === 'ready' && grantableMailboxes.length === 0 && (
        <Callout variant="neutral" className="mb-6">You are not a member of any mailbox yet, so there is nothing to grant access to.</Callout>
      )}

      {writeError && (
        <div className="mb-6">
          <Callout variant="danger" role="alert" actions={<Button size="sm" onClick={() => void load()}>Reload connections</Button>}>{writeError}</Callout>
        </div>
      )}

      {list.status === 'loading' && <div role="status" aria-label="Loading connections"><Skeleton rows={3} /></div>}

      {list.status === 'error' && (
        <ErrorState title="Connections could not be loaded" body={list.message} action={<Button variant="primary" onClick={() => void load()}>Try again</Button>} className="mx-0" />
      )}

      {list.status === 'ready' && (
        <ConnectionsList
          grants={list.grants}
          mailboxFilter={mailboxFilter}
          focusId={focusId}
          nameFor={nameFor}
          busy={busy}
          onFilterMailbox={(id) => setParam('mailbox', id)}
          onFocus={(id) => setParam('connection', id)}
          onRevoke={(grant) => setConfirm({ kind: 'revoke', grant })}
          onRemoveMailbox={(grant, mailboxId) => setConfirm({ kind: 'removeMailbox', grant, mailboxId })}
        />
      )}

      {grantOpen && (
        <GrantDialog
          open={grantOpen}
          mailboxes={grantableMailboxes.map((m) => ({ id: m.id, display_name: m.display_name }))}
          busy={busy}
          onOpenChange={setGrantOpen}
          onCreate={createGrant}
        />
      )}

      <SecretDialog secret={secret} onClose={() => setSecret(null)} />

      <Modal
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={confirm?.kind === 'revoke' ? 'Revoke this connection?' : 'Remove this mailbox from the connection?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>Cancel</Button>
            <Button variant="danger" onClick={() => void confirmAction()} disabled={busy}>{confirm?.kind === 'revoke' ? 'Revoke connection' : 'Remove mailbox'}</Button>
          </>
        }
      >
        {confirm?.kind === 'revoke' && (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">“{confirm.grant.client_name}” will immediately lose access to every mailbox in this connection, and its credential will stop working. This cannot be undone; grant a new connection to restore access.</p>
        )}
        {confirm?.kind === 'removeMailbox' && (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">“{confirm.grant.client_name}” will no longer be able to read {nameFor(confirm.mailboxId, confirm.grant.mailboxes.find((m) => m.mailbox_id === confirm.mailboxId)?.display_name ?? 'this mailbox')}. The connection keeps its other mailboxes.</p>
        )}
      </Modal>
    </section>
  )
}

interface ConnectionsListProps {
  grants: readonly ConnectorGrant[]
  mailboxFilter: string | null
  focusId: string | null
  nameFor(mailboxId: string, fallback: string): string
  busy: boolean
  onFilterMailbox(id: string | null): void
  onFocus(id: string | null): void
  onRevoke(grant: ConnectorGrant): void
  onRemoveMailbox(grant: ConnectorGrant, mailboxId: string): void
}

function ConnectionsList({ grants, mailboxFilter, focusId, nameFor, busy, onFilterMailbox, onFocus, onRevoke, onRemoveMailbox }: ConnectionsListProps) {
  const filterId = useId()
  // The mailboxes present across all connections, for the filter dropdown (id → display name).
  const filterable = useMemo(() => {
    const map = new Map<string, string>()
    for (const grant of grants) for (const mailbox of grant.mailboxes) if (!map.has(mailbox.mailbox_id)) map.set(mailbox.mailbox_id, nameFor(mailbox.mailbox_id, mailbox.display_name))
    return [...map.entries()]
  }, [grants, nameFor])

  // A focused connection (deep link / selection) wins over the mailbox filter; a stale id is ignored.
  const focused = focusId !== null ? grants.find((grant) => grant.id === focusId) : undefined
  const visible = focused
    ? [focused]
    : mailboxFilter !== null
      ? grants.filter((grant) => grant.mailboxes.some((m) => m.mailbox_id === mailboxFilter))
      : grants

  if (grants.length === 0) {
    return (
      <EmptyState
        icon={<CommandLineIcon className="size-5" />}
        title="No connections yet"
        body="No AI client can read your mail. Choose “Grant access” to connect one to the mailboxes you pick."
        className="mx-0"
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {focused ? (
          <Button size="sm" variant="outline" onClick={() => onFocus(null)}>Show all connections</Button>
        ) : (
          filterable.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <span id={filterId}>Filter by mailbox</span>
              <Select aria-labelledby={filterId} value={mailboxFilter ?? ''} onChange={(event) => onFilterMailbox(event.target.value === '' ? null : event.target.value)} className="w-56">
                <option value="">All mailboxes</option>
                {filterable.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </Select>
            </label>
          )
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={<CommandLineIcon className="size-5" />} title="No connections for that mailbox" body="No connection grants access to the selected mailbox." action={<Button variant="outline" onClick={() => onFilterMailbox(null)}>Clear filter</Button>} className="mx-0" />
      ) : (
        <ul className="space-y-4">
          {visible.map((grant) => (
            <li key={grant.id}>
              <ConnectionCard grant={grant} highlighted={focused?.id === grant.id} nameFor={nameFor} busy={busy} onFocus={onFocus} onRevoke={onRevoke} onRemoveMailbox={onRemoveMailbox} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function expiryNote(expiresAt: string | null): { text: string; expired: boolean } {
  if (expiresAt === null) return { text: 'No expiry', expired: false }
  const expired = new Date(expiresAt).getTime() <= Date.now()
  return { text: `${expired ? 'Expired' : 'Expires'} ${formatDateTime(expiresAt)}`, expired }
}

interface ConnectionCardProps {
  grant: ConnectorGrant
  highlighted: boolean
  nameFor(mailboxId: string, fallback: string): string
  busy: boolean
  onFocus(id: string | null): void
  onRevoke(grant: ConnectorGrant): void
  onRemoveMailbox(grant: ConnectorGrant, mailboxId: string): void
}

function ConnectionCard({ grant, highlighted, nameFor, busy, onFocus, onRevoke, onRemoveMailbox }: ConnectionCardProps) {
  const expiry = expiryNote(grant.expires_at)
  // Removing the only mailbox would leave an empty connection; the user revokes the whole connection instead.
  const soleMailbox = grant.mailboxes.length === 1
  return (
    <Card className={cx('space-y-4', highlighted && 'ring-2 ring-(--color-accent)')} aria-current={highlighted ? 'true' : undefined}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-medium text-zinc-800 dark:text-white">{grant.client_name}</h3>
            <Badge tone="neutral" size="sm">{CLIENT_LABELS[grant.client_kind]}</Badge>
            <Badge tone="warn" size="sm">External AI</Badge>
            {expiry.expired && <Badge tone="danger" size="sm">Expired</Badge>}
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Connected {formatDateTime(grant.created_at)} · {grant.last_used_at === null ? 'Never used' : `Last used ${formatDateTime(grant.last_used_at)}`} · {expiry.text}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => onFocus(highlighted ? null : grant.id)} aria-pressed={highlighted}>{highlighted ? 'Done' : 'View'}</Button>
          <Button size="sm" variant="danger" onClick={() => onRevoke(grant)} disabled={busy}>Revoke</Button>
        </div>
      </div>

      {/* Per-connection plain-language notice, required because mail content leaves for an external AI. */}
      <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-400/10 dark:text-amber-100">
        <ExclamationTriangleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>Mail in the mailboxes below is readable by {grant.client_name} (external AI). Content is sent to that AI provider when it reads.</span>
      </p>

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-700" aria-label={`Mailboxes ${grant.client_name} can access`}>
        {grant.mailboxes.map((mailbox) => {
          const name = nameFor(mailbox.mailbox_id, mailbox.display_name)
          return (
            <li key={mailbox.mailbox_id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-zinc-800 dark:text-white">{name}</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {mailbox.scopes.map((scope) => (
                    <Badge key={scope} tone="neutral" size="sm">{SCOPE_LABELS[scope]}</Badge>
                  ))}
                </p>
                {/* The exact per-mailbox sharing sentence (task requirement). */}
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-200">Mail in {name} can be read by {grant.client_name} (external AI). Content is sent to that AI provider when it reads.</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRemoveMailbox(grant, mailbox.mailbox_id)}
                disabled={busy || soleMailbox}
                title={soleMailbox ? 'This is the connection’s only mailbox. Revoke the connection instead.' : undefined}
              >
                Remove
              </Button>
            </li>
          )
        })}
      </ul>
      {soleMailbox && <p className="text-xs text-zinc-500">This is the connection’s only mailbox. Revoke the whole connection to remove it.</p>}
    </Card>
  )
}

interface GrantDialogProps {
  open: boolean
  mailboxes: ReadonlyArray<{ id: string; display_name: string }>
  busy: boolean
  onOpenChange(open: boolean): void
  /** Resolves to an error message to show inline, or null on success (the dialog is then closed). */
  onCreate(input: ConnectorGrantCreateInput): Promise<string | null>
}

/** Per-mailbox selection in the grant form: included, and whether draft:write is added to mailbox:read. */
type MailboxChoice = { included: boolean; draft: boolean }

export function GrantDialog({ open, mailboxes, busy, onOpenChange, onCreate }: GrantDialogProps) {
  const id = useId()
  const [clientName, setClientName] = useState('')
  const [clientKind, setClientKind] = useState<ConnectorClientKind>('claude')
  const [expiry, setExpiry] = useState('never')
  const [choices, setChoices] = useState<Record<string, MailboxChoice>>({})
  const [error, setError] = useState<string | null>(null)

  const setChoice = (mailboxId: string, patch: Partial<MailboxChoice>) =>
    setChoices((prev) => ({ ...prev, [mailboxId]: { included: false, draft: false, ...prev[mailboxId], ...patch } }))

  const close = () => {
    setClientName('')
    setClientKind('claude')
    setExpiry('never')
    setChoices({})
    setError(null)
    onOpenChange(false)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const name = clientName.trim()
    if (name === '' || name.length > 120) return setError('Enter a name for this connection (1 to 120 characters).')
    const selected = mailboxes.filter((mailbox) => choices[mailbox.id]?.included)
    if (selected.length === 0) return setError('Choose at least one mailbox to share.')
    // AIDEV-NOTE: mirror the proposed gateway contract so over-limit selections get actionable feedback.
    if (selected.length > CONNECTOR_GRANT_MAX_MAILBOXES) return setError(`Choose at most ${CONNECTOR_GRANT_MAX_MAILBOXES} mailboxes per connection. Remove some selections and try again.`)
    const days = EXPIRY_OPTIONS.find((option) => option.value === expiry)?.days ?? null
    const input: ConnectorGrantCreateInput = {
      client_name: name,
      client_kind: clientKind,
      expires_at: days === null ? null : new Date(Date.now() + days * 86_400_000).toISOString(),
      // Read is always granted; draft:write is added only where the user opted in.
      mailboxes: selected.map((mailbox) => ({
        mailbox_id: mailbox.id,
        scopes: (choices[mailbox.id]?.draft ? ['mailbox:read', 'draft:write'] : ['mailbox:read']) as ConnectorScope[],
      })),
    }
    const refused = await onCreate(input)
    if (refused !== null) setError(refused)
    else close()
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      title="Grant a connection"
      description="Give an AI client read access (and optionally draft access) to the mailboxes you choose."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
          <Button variant="primary" type="submit" form={`${id}-form`} disabled={busy}>{busy ? 'Granting…' : 'Grant access'}</Button>
        </>
      }
    >
      <form id={`${id}-form`} className="space-y-6" onSubmit={(event) => void submit(event)} noValidate>
        <Field id={`${id}-name`} label="Connection name" hint="A label you will recognise, e.g. “Claude on my laptop”." error={error && error.startsWith('Enter a name') ? error : null}>
          <TextInput id={`${id}-name`} value={clientName} maxLength={120} autoComplete="off" onChange={(event) => setClientName(event.target.value)} aria-invalid={error && error.startsWith('Enter a name') ? true : undefined} aria-describedby={`${id}-name-hint`} />
        </Field>

        <Field id={`${id}-kind`} label="Client">
          <Select id={`${id}-kind`} value={clientKind} onChange={(event) => setClientKind(event.target.value as ConnectorClientKind)}>
            {CONNECTOR_CLIENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>{CLIENT_LABELS[kind]}</option>
            ))}
          </Select>
        </Field>

        <Field id={`${id}-expiry`} label="Expiry">
          <Select id={`${id}-expiry`} value={expiry} onChange={(event) => setExpiry(event.target.value)}>
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </Field>

        <fieldset aria-describedby={`${id}-mailboxes-note`}>
          <legend className="text-sm font-medium text-zinc-800 dark:text-white">Mailboxes to share</legend>
          <p id={`${id}-mailboxes-note`} className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Each selected mailbox grants Read mail. Add Write drafts only if the client should be able to draft replies. Content in these mailboxes is sent to the AI provider when the client reads it.</p>
          <ul className="mt-3 space-y-3">
            {mailboxes.map((mailbox) => {
              const choice = choices[mailbox.id] ?? { included: false, draft: false }
              return (
                <li key={mailbox.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                  <CheckboxField id={`${id}-mb-${mailbox.id}`} label={mailbox.display_name} checked={choice.included} onChange={(event) => setChoice(mailbox.id, { included: event.target.checked })} />
                  {choice.included && (
                    <div className="mt-2 ps-7">
                      <CheckboxField id={`${id}-draft-${mailbox.id}`} label="Also allow writing drafts (draft:write)" checked={choice.draft} onChange={(event) => setChoice(mailbox.id, { draft: event.target.checked })} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </fieldset>

        {error && !error.startsWith('Enter a name') && <p role="alert" className="text-sm font-medium text-red-500 dark:text-red-400">{error}</p>}
      </form>
    </Modal>
  )
}

/** The one-time secret display: shown exactly once after a grant, with a copy affordance and a warning. */
function SecretDialog({ secret, onClose }: { secret: { clientName: string; value: string } | null; onClose(): void }) {
  return (
    <Modal
      open={secret !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Copy the connection secret"
      description="This is the only time the secret is shown."
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}
    >
      {secret && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-800 dark:text-zinc-200">Paste this secret into “{secret.clientName}” to finish connecting. Store it in a secret manager — you won’t be able to see it again. If you lose it, revoke the connection and grant a new one.</p>
          <CodeBlock code={secret.value} />
          <Callout variant="warning">The secret is not stored in a readable form. Once you close this dialog it cannot be shown again.</Callout>
        </div>
      )}
    </Modal>
  )
}

/** Planned connection workflow; package availability and credentials must match the integration detail page. */
export function ConnectClientReference() {
  const mcp = INTEGRATIONS.find((integration) => integration.slug === 'mcp')
  if (mcp === undefined) return null
  return (
    <section aria-label="Connect a client" className="space-y-4">
      <SectionHeader title="Connect a client" subtitle={mcp.intro} className="mb-0" />
      <PlannedConnectorNotice />
      {mcp.steps.map((step, index) => (
        <Card key={step.title}>
          <h3 className="text-base font-medium text-zinc-800 dark:text-white">{index + 1}. {step.title}</h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{step.text}</p>
          {step.code !== undefined && <CodeBlock code={step.code} {...(step.language === undefined ? {} : { language: step.language })} className="mt-4" />}
        </Card>
      ))}
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Looking for the terminal connector instead? <Link to="/settings/integrations/cli" className="font-medium text-(--color-accent-content) hover:underline">Elevateo CLI</Link>.
      </p>
    </section>
  )
}
