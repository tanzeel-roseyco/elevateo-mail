// Explicit mailbox membership administration (BE-02 D §8). Every write carries the mailbox-wide
// membership revision from the last list; a stale revision is a 409 and the person reloads the
// roster before acting again. The server protects the last manager. A successful change that
// returns a different authorization_version for the actor means their own access changed: the
// protected caches are cleared by an explicit re-bootstrap rather than trusting the old version.
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { describeFailure, type CollaborationFailure } from '@/app/collaborationFailure'
import { useMailbox } from '@/app/mailboxes'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useGateway, useSession } from '@/app/session'
import type { MailboxMember, MailboxMemberPage, MailboxMembershipResult, MembershipCapabilities } from '@/data/contract'
import { isApiError } from '@/data/errors'
import type { CsrfProof, ReadContext } from '@/data/gateway'
import { canonicalId } from '@/lib/ids'
import { Avatar } from '@/ui/Avatar'
import { Badge } from '@/ui/Badge'
import { Callout } from '@/ui/Callout'
import { Card } from '@/ui/Card'
import { PageHeader } from '@/ui/PageHeader'
import { UserGroupIcon } from '@/ui/icons'
import { Button } from '@/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '@/ui/Async'
import { CheckboxField, Field, TextInput } from '@/ui/Field'

/** Bounded roster traversal: at most this many pages (50 members each) per load. */
const MAX_MEMBER_PAGES = 20
const FLAGS: Array<{ key: keyof MembershipCapabilities; label: string }> = [
  { key: 'compose', label: 'Compose' },
  { key: 'approve_send', label: 'Approve send' },
  { key: 'manage_members', label: 'Manage members' },
]

type RosterState =
  | { status: 'loading' }
  | { status: 'ready'; version: number; members: MailboxMember[]; more: boolean }
  | { status: 'unavailable' }
  | { status: 'error'; failure: CollaborationFailure }

export function MembersPage() {
  const { mailboxId } = useParams<{ mailboxId: string }>()
  if (mailboxId === undefined) return null
  return <MemberRoster key={mailboxId} mailboxId={mailboxId} />
}

function MemberRoster({ mailboxId }: { mailboxId: string }) {
  const gateway = useGateway()
  const mailbox = useMailbox(mailboxId)
  const { state: sessionState, refresh } = useSession()
  const actorId = sessionState.status === 'ready' ? sessionState.session.actor.id : null
  const { context, proof, request } = useProtectedRequest()
  const [roster, setRoster] = useState<RosterState>({ status: 'loading' })
  const [busyUser, setBusyUser] = useState<string | null>(null)
  // AIDEV-NOTE: Busy state belongs to one write; a stale completion releases only its own token
  // and can never clear a newer write's busy row (design review fe02-cd-22 finding 6).
  const writeTokenRef = useRef(0)
  const [failure, setFailure] = useState<CollaborationFailure | null>(null)
  const [newUserText, setNewUserText] = useState('')
  const [newUserError, setNewUserError] = useState<string | null>(null)
  const [newFlags, setNewFlags] = useState<MembershipCapabilities>({ compose: false, approve_send: false, manage_members: false })
  const ids = { user: useId(), flags: useId() }

  const load = useCallback(async () => {
    setRoster({ status: 'loading' })
    setFailure(null)
    let members: MailboxMember[] = []
    const seen = new Set<string>()
    let version = 0
    let cursor: string | undefined
    let pages = 0
    let resetUsed = false
    do {
      const requestCursor = cursor
      const outcome = await request((ctx, signal) => gateway.listMailboxMembers(ctx, mailboxId, requestCursor === undefined ? {} : { cursor: requestCursor }, signal))
      if (outcome.kind === 'stale') return
      if (outcome.kind === 'failed') {
        // A roster cursor is bound to the mailbox revision; one reset restarts from page one (D4).
        if (isApiError(outcome.error, 'cursor_invalid') && requestCursor !== undefined && !resetUsed) {
          resetUsed = true
          members = []
          seen.clear()
          cursor = undefined
          continue
        }
        const described = describeFailure(outcome.error, 'read')
        setRoster(described.code === 'unavailable_resource' ? { status: 'unavailable' } : { status: 'error', failure: described })
        return
      }
      const page: MailboxMemberPage = outcome.value
      version = page.membership_version
      for (const member of page.items) {
        if (!seen.has(member.user_id)) {
          seen.add(member.user_id)
          members.push(member)
        }
      }
      cursor = page.next_cursor ?? undefined
      pages += 1
    } while (cursor !== undefined && pages < MAX_MEMBER_PAGES)
    setRoster({ status: 'ready', version, members, more: cursor !== undefined })
  }, [gateway, request, mailboxId])

  useEffect(() => {
    void load()
  }, [load])

  /** Apply a successful membership result to the roster and honour a rotated actor authorization. */
  const applyResult = (result: MailboxMembershipResult) => {
    setRoster((prev) => {
      if (prev.status !== 'ready') return prev
      const others = prev.members.filter((m) => m.user_id !== result.user_id)
      const members = result.member === null ? others : [...others, result.member].sort((a, b) => (a.user_id < b.user_id ? -1 : 1))
      return { ...prev, version: result.membership_version, members }
    })
    if (context !== null && result.authorization_version !== context.authorizationVersion) {
      // The actor's own authority changed (self-demotion/removal): protected caches must not be
      // reused under the old version. Explicit re-bootstrap, never a silent continuation (§8).
      setFailure({ code: 'failed', message: 'Your own access to this mailbox changed. Reloading your session.', uncertain: false, retryAfterSeconds: null })
      refresh()
    }
  }

  /** One guarded membership write at the roster revision currently on screen. */
  /** Resolves `true` only when the server confirmed the write. */
  const write = async (
    userId: string,
    work: (ctx: ReadContext, proof: CsrfProof, expectedVersion: number, signal: AbortSignal) => Promise<MailboxMembershipResult>,
  ): Promise<boolean> => {
    if (roster.status !== 'ready' || !proof || busyUser !== null) return false
    const expected = roster.version
    const sessionProof = proof
    const token = ++writeTokenRef.current
    setBusyUser(userId)
    setFailure(null)
    const outcome = await request((ctx, signal) => work(ctx, sessionProof, expected, signal))
    // Release the busy row whatever happened, but only while this write still owns it.
    if (writeTokenRef.current === token) setBusyUser(null)
    if (outcome.kind === 'stale') return false
    if (outcome.kind === 'failed') {
      setFailure(describeFailure(outcome.error, 'write'))
      return false
    }
    applyResult(outcome.value)
    return true
  }

  const putMember = (userId: string, capabilities: MembershipCapabilities) =>
    write(userId, (ctx, sessionProof, expected, signal) =>
      gateway.putMailboxMember(ctx, sessionProof, mailboxId, userId, { expected_membership_version: expected, capabilities }, signal),
    )

  const removeMember = (userId: string) =>
    void write(userId, (ctx, sessionProof, expected, signal) => gateway.deleteMailboxMember(ctx, sessionProof, mailboxId, userId, expected, signal))

  const addMember = () => {
    const userId = canonicalId(newUserText)
    if (userId === null) {
      setNewUserError('Enter the user id in UUID form.')
      return
    }
    setNewUserError(null)
    // The field clears only after a confirmed add; a 409/503 keeps the id for the retry.
    void putMember(userId, newFlags).then((ok) => {
      if (ok) setNewUserText('')
    })
  }

  const canManage = mailbox === undefined ? true : mailbox.capabilities.manage_members
  const disabled = !proof || busyUser !== null || roster.status !== 'ready'

  return (
    <section aria-label="Mailbox members">
      <PageHeader
        title="Members"
        subtitle={mailbox ? `${mailbox.display_name}${mailbox.display_address ? ` · ${mailbox.display_address}` : ''}` : 'Mailbox membership'}
        actions={roster.status === 'ready' ? <Badge tone="neutral">Roster revision {roster.version}</Badge> : undefined}
      />
      <p className="mb-6 max-w-3xl text-sm text-muted">
        Explicit members of this mailbox. An explicit row grants read; shared mailboxes may also be readable without a row. Only user ids are shown: this build has no user directory.
      </p>
      {roster.status === 'loading' && <div role="status" aria-label="Loading members"><Skeleton rows={4} /></div>}
      {/* AIDEV-NOTE: One API refusal gets one panel; known read-only access can explain it more precisely. */}
      {roster.status === 'unavailable' && <EmptyState
        icon={<UserGroupIcon className="size-5" />}
        title={canManage ? 'Members are unavailable' : 'You cannot manage members of this mailbox'}
        body={canManage ? 'This mailbox may not exist, or you may not currently be able to manage its members.' : 'Managing members requires the manage-members capability.'}
      />}
      {roster.status === 'error' && (
        <div>
          <ErrorState title="Members could not be loaded" body={roster.failure.message} action={<Button variant="primary" onClick={() => void load()}>Try again</Button>} />
        </div>
      )}
      {roster.status === 'ready' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            {roster.members.length === 0 && <EmptyState icon={<UserGroupIcon className="size-5" />} title="No explicit members" body="Nobody has an explicit membership row in this mailbox." />}
            {roster.members.length > 0 && (
              <Card className="p-0">
                <ul className="divide-y divide-line ">
                  {roster.members.map((member) => (
                    <MemberRow
                      key={member.user_id}
                      member={member}
                      isSelf={member.user_id === actorId}
                      busy={busyUser === member.user_id}
                      disabled={disabled || !canManage}
                      onApply={(capabilities) => putMember(member.user_id, capabilities)}
                      onRemove={() => removeMember(member.user_id)}
                    />
                  ))}
                </ul>
              </Card>
            )}
            {roster.more && <p className="mt-2 text-xs text-muted">More members exist than are shown here.</p>}
            {failure && (
              <div className="mt-4">
                <Callout variant="danger" role="alert" actions={(failure.code === 'stale_version' || failure.uncertain) && <Button size="sm" onClick={() => void load()}>Reload members</Button>}>
                  {failure.message}
                </Callout>
              </div>
            )}
          </div>
          {canManage && (
            <Card>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  addMember()
                }}
                noValidate
              >
                <h2 className="text-base font-medium text-fg ">Add or update a member</h2>
                <Field id={ids.user} label="User id" hint="UUID of a current organization member. An existing member's flags are replaced." error={newUserError}>
                  <TextInput id={ids.user} value={newUserText} onChange={(e) => setNewUserText(e.target.value)} disabled={disabled} autoComplete="off" spellCheck={false} aria-invalid={newUserError ? true : undefined} aria-describedby={`${ids.user}-hint`} className="font-mono text-xs" />
                </Field>
                <fieldset className="flex flex-col gap-2" aria-describedby={`${ids.flags}-hint`}>
                  <legend className="mb-2 text-sm font-medium text-fg ">Capabilities</legend>
                  {FLAGS.map((flag) => (
                    <CheckboxField key={flag.key} id={`${ids.flags}-${flag.key}`} label={flag.label} checked={newFlags[flag.key]} disabled={disabled} onChange={(e) => setNewFlags({ ...newFlags, [flag.key]: e.target.checked })} />
                  ))}
                </fieldset>
                <p id={`${ids.flags}-hint`} className="text-xs text-muted">Read is granted by the membership itself. Sending is not available in this build regardless of these flags.</p>
                <div>
                  <Button type="submit" variant="primary" disabled={disabled || newUserText.trim() === ''}>Save member</Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      )}
    </section>
  )
}

function MemberRow({ member, isSelf, busy, disabled, onApply, onRemove }: { member: MailboxMember; isSelf: boolean; busy: boolean; disabled: boolean; onApply(capabilities: MembershipCapabilities): void; onRemove(): void }) {
  const [flags, setFlags] = useState<MembershipCapabilities>(member.capabilities)
  const [serverFlags, setServerFlags] = useState(member.capabilities)
  const rowId = useId()
  // AIDEV-NOTE: Reset only for a new server copy, before commit; a mount effect can overwrite an early edit.
  if (serverFlags !== member.capabilities) {
    setServerFlags(member.capabilities)
    setFlags(member.capabilities)
  }
  const changed = FLAGS.some((f) => flags[f.key] !== member.capabilities[f.key])
  return (
    <li className="flex flex-col gap-3 px-6 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={member.user_id.slice(0, 2)} />
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg ">{member.user_id}</code>
        {isSelf && <Badge tone="accent" size="sm">You</Badge>}
        {busy && <span role="status" className="text-xs text-muted">Saving…</span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {FLAGS.map((flag) => (
          <CheckboxField key={flag.key} id={`${rowId}-${flag.key}`} label={flag.label} checked={flags[flag.key]} disabled={disabled || busy} onChange={(e) => setFlags({ ...flags, [flag.key]: e.target.checked })} />
        ))}
        <span className="ms-auto flex gap-2">
          <Button size="sm" variant="primary" disabled={disabled || busy || !changed} onClick={() => onApply(flags)}>Apply</Button>
          <Button size="sm" variant="danger" disabled={disabled || busy} onClick={onRemove}>Remove</Button>
        </span>
      </div>
    </li>
  )
}
