// Settings › Workspace: the EmailGuard hub (five link cards) and its detail pages. "Manage Members"
// is real (organization grants + per-mailbox membership); name, invitations and workspace creation
// have no backend endpoint and are labelled simulated adapters (settings/simulatedStore.ts).
import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { z } from 'zod'
import { useMailboxes } from '@/app/mailboxes'
import { useSession } from '@/app/session'
import { AdministrationPage } from '@/features/members/AdministrationPage'
import { Skeleton, EmptyState } from '@/ui/Async'
import { Badge } from '@/ui/Badge'
import { Button, buttonClass } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { Card, LinkCard, LinkCardGrid } from '@/ui/Card'
import { Field, Select, TextArea, TextInput } from '@/ui/Field'
import { Modal } from '@/ui/Modal'
import { SectionHeader } from '@/ui/PageHeader'
import { EnvelopeIcon } from '@/ui/icons'
import { useToast } from '@/ui/Toast'
import { SimulatedAdapterNotice } from './SettingsLayout'
import { simulatedId, useSimulatedStore } from './simulatedStore'

export function WorkspaceHubPage() {
  return (
    <LinkCardGrid>
      <LinkCard to="/settings/workspace/name" title="Update Workspace Name" text="Modify your current workspace name" />
      <LinkCard to="/settings/workspace/invite" title="Invite New Members" text="Invite team members to collaborate" />
      <LinkCard to="/settings/workspace/members" title="Manage Members" text="Complete team member management" />
      <LinkCard to="/settings/workspace/invitations" title="View Pending Invitations" text="Edit or remove pending member invitations" />
      <LinkCard to="/settings/workspace/create" title="Create a new workspace" text="Create a new workspace to separate your data" />
    </LinkCardGrid>
  )
}

// --- Workspace name (simulated) -------------------------------------------------------------
const WorkspaceNameSchema = z.object({ name: z.string().min(1).max(120) })

export function WorkspaceNamePage() {
  const { state } = useSession()
  const serverName = state.status === 'ready' ? state.session.organization.name : ''
  const store = useSimulatedStore('workspace-name', WorkspaceNameSchema, { name: '' })
  const [name, setName] = useState(store.value.name === '' ? serverName : store.value.name)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()
  const id = useId()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = WorkspaceNameSchema.safeParse({ name: name.trim() })
    if (!parsed.success) {
      setError('Enter a workspace name of 1 to 120 characters.')
      return
    }
    setError(null)
    store.set(parsed.data)
    toast('Workspace name saved in this browser only.', 'neutral')
  }
  return (
    <>
      <SimulatedAdapterNotice>
        The organization name shown in the sidebar comes from the server and cannot be changed here. The name below is a local label for this browser.
      </SimulatedAdapterNotice>
      <Card className="max-w-lg">
        <form className="space-y-6" onSubmit={submit} noValidate>
          <Field id={id} label="Workspace name" hint={`Server name: ${serverName || 'unavailable'}`} error={error}>
            <TextInput id={id} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} aria-invalid={error ? true : undefined} aria-describedby={`${id}-hint`} />
          </Field>
          <Button type="submit" variant="primary" disabled={!store.writable}>Save workspace name</Button>
        </form>
      </Card>
    </>
  )
}

// --- Invitations (simulated) ----------------------------------------------------------------
const InvitationSchema = z.object({
  id: z.string().min(1),
  email: z.string().email().max(254),
  role: z.enum(['member', 'admin']),
  created_at: z.string(),
})
type Invitation = z.infer<typeof InvitationSchema>
/** Hard limit of the adapter; a full list refuses new invitations instead of evicting old ones. */
export const INVITATION_LIMIT = 500
const InvitationsSchema = z.array(InvitationSchema).max(INVITATION_LIMIT)
const NO_INVITATIONS: readonly Invitation[] = []

function useInvitations() {
  return useSimulatedStore<readonly Invitation[]>('invitations', InvitationsSchema, NO_INVITATIONS)
}

export function WorkspaceInvitePage() {
  const store = useInvitations()
  const [emails, setEmails] = useState('')
  const [role, setRole] = useState<Invitation['role']>('member')
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()
  const id = useId()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    // Addresses compare case-insensitively (one invitation per mailbox), within this submission
    // and against the pending list read at write time.
    const candidates = Array.from(new Set(emails.split(/[\s,;]+/).map((value) => value.trim().toLowerCase()).filter((value) => value !== '')))
    if (candidates.length === 0) {
      setError('Enter at least one email address.')
      return
    }
    const invalid = candidates.find((value) => !InvitationSchema.shape.email.safeParse(value).success)
    if (invalid !== undefined) {
      setError(`"${invalid}" is not a valid email address.`)
      return
    }
    const now = new Date().toISOString()
    let added = 0
    let refused: string | null = null
    store.update((current) => {
      const pending = new Set(current.map((inv) => inv.email.toLowerCase()))
      const fresh = candidates.filter((email) => !pending.has(email)).map((email) => ({ id: simulatedId(), email, role, created_at: now }))
      if (current.length + fresh.length > INVITATION_LIMIT) {
        refused = `Only ${INVITATION_LIMIT} pending invitations are kept. Remove some before adding ${fresh.length} more.`
        return null
      }
      added = fresh.length
      return fresh.length === 0 ? null : [...current, ...fresh]
    })
    setError(refused)
    if (refused !== null) return
    setEmails('')
    toast(added === 0 ? 'Those addresses are already pending.' : `${added} invitation${added === 1 ? '' : 's'} recorded in this browser only. No email was sent.`, 'neutral')
  }
  return (
    <>
      <SimulatedAdapterNotice>Invitations are recorded locally and no invitation email is sent. Real membership is granted by an organization administrator on the server.</SimulatedAdapterNotice>
      <Card className="max-w-lg">
        <form className="space-y-6" onSubmit={submit} noValidate>
          <Field id={`${id}-emails`} label="Email addresses" hint="One per line, or separated by commas." error={error}>
            <TextArea id={`${id}-emails`} rows={4} value={emails} onChange={(event) => setEmails(event.target.value)} aria-invalid={error ? true : undefined} aria-describedby={`${id}-emails-hint`} />
          </Field>
          <fieldset className="space-y-2">
            <legend className="mb-3 text-sm font-medium text-zinc-800 dark:text-white">Role</legend>
            {(['member', 'admin'] as const).map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                <input type="radio" name={`${id}-role`} value={option} checked={role === option} onChange={() => setRole(option)} className="size-4 accent-(--color-accent)" />
                {option === 'member' ? 'Member' : 'Administrator'}
              </label>
            ))}
          </fieldset>
          <Button type="submit" variant="primary" disabled={!store.writable}>Send invitations</Button>
        </form>
      </Card>
    </>
  )
}

export function WorkspaceInvitationsPage() {
  const store = useInvitations()
  const { toast } = useToast()
  const [editing, setEditing] = useState<Invitation | null>(null)
  const remove = (id: string) => {
    store.update((current) => current.filter((inv) => inv.id !== id))
    toast('Invitation removed.', 'neutral')
  }
  /** Returns an error message when the edit is refused (duplicate address); null on success. */
  const save = (id: string, email: string, role: Invitation['role']): string | null => {
    let refused: string | null = null
    store.update((current) => {
      if (current.some((inv) => inv.id !== id && inv.email.toLowerCase() === email)) {
        refused = 'Another pending invitation already uses that address.'
        return null
      }
      return current.map((inv) => (inv.id === id ? { ...inv, email, role } : inv))
    })
    if (refused === null) toast('Invitation updated in this browser only.', 'neutral')
    return refused
  }
  return (
    <>
      <SimulatedAdapterNotice />
      {editing && <EditInvitationModal invitation={editing} onClose={() => setEditing(null)} onSave={save} />}
      <div className="max-w-3xl">
        {store.value.length === 0 ? (
          <EmptyState icon={<EnvelopeIcon className="size-5" />} title="No pending invitations" body="Invitations you record on the Invite New Members page appear here until you remove them." action={<Link to="/settings/workspace/invite" className={buttonClass('primary', 'md')}>Invite New Members</Link>} />
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-700" aria-label="Pending invitations">
              {store.value.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 px-6 py-4 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-800 dark:text-white">{inv.email}</span>
                  <Badge tone="neutral" size="sm">{inv.role === 'admin' ? 'Administrator' : 'Member'}</Badge>
                  <Badge tone="warn" size="sm">Pending · not sent</Badge>
                  <Button size="sm" onClick={() => setEditing(inv)}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => remove(inv.id)}>Remove</Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  )
}

function EditInvitationModal({ invitation, onClose, onSave }: { invitation: Invitation; onClose(): void; onSave(id: string, email: string, role: Invitation['role']): string | null }) {
  const id = useId()
  const [email, setEmail] = useState(invitation.email)
  const [role, setRole] = useState<Invitation['role']>(invitation.role)
  const [error, setError] = useState<string | null>(null)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const normalized = email.trim().toLowerCase()
    if (!InvitationSchema.shape.email.safeParse(normalized).success) return setError('Enter a valid email address.')
    const refused = onSave(invitation.id, normalized, role)
    if (refused !== null) return setError(refused)
    onClose()
  }
  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Edit invitation"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form={`${id}-form`}>Save changes</Button>
        </>
      }
    >
      <form id={`${id}-form`} className="space-y-4" onSubmit={submit} noValidate>
        <Field id={`${id}-email`} label="Email address" error={error}>
          <TextInput id={`${id}-email`} type="email" value={email} maxLength={254} onChange={(event) => setEmail(event.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-email-error` : undefined} />
        </Field>
        <Field id={`${id}-role`} label="Role">
          <Select id={`${id}-role`} value={role} onChange={(event) => setRole(event.target.value === 'admin' ? 'admin' : 'member')}>
            <option value="member">Member</option>
            <option value="admin">Administrator</option>
          </Select>
        </Field>
      </form>
    </Modal>
  )
}

// --- Create workspace (simulated) -----------------------------------------------------------
export function WorkspaceCreatePage() {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const id = useId()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length === 0 || trimmed.length > 120) {
      setError('Enter a workspace name of 1 to 120 characters.')
      return
    }
    setError(null)
    setDone(trimmed)
  }
  return (
    <>
      <SimulatedAdapterNotice>Workspaces are organizations on the server and can only be created by an operator. This form validates the request and shows what would be submitted.</SimulatedAdapterNotice>
      <Card className="max-w-lg">
        <form className="space-y-6" onSubmit={submit} noValidate>
          <Field id={id} label="New workspace name" error={error}>
            <TextInput id={id} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} aria-invalid={error ? true : undefined} />
          </Field>
          {done !== null && <Callout variant="neutral" role="status">A workspace named “{done}” would be requested. Nothing was created on the server.</Callout>}
          <Button type="submit" variant="primary">Create workspace</Button>
        </form>
      </Card>
    </>
  )
}

// --- Manage members (real) ------------------------------------------------------------------
export function WorkspaceMembersPage() {
  const mailboxes = useMailboxes()
  return (
    <div className="space-y-8">
      <div>
        <SectionHeader title="Mailbox members" subtitle="Each mailbox keeps its own explicit member list. Open one to add, update or remove members." className="mt-0" />
        {mailboxes.status === 'loading' && <div role="status" aria-label="Loading mailboxes" className="max-w-md"><Skeleton rows={2} /></div>}
        {mailboxes.status === 'error' && <Callout variant="danger" role="alert">Mailboxes could not be loaded. Use Try again in the navigation.</Callout>}
        {mailboxes.status === 'ready' && mailboxes.mailboxes.length === 0 && <EmptyState icon={<EnvelopeIcon className="size-5" />} title="No visible mailboxes" body="You are not a member of any mailbox in this organization." />}
        {mailboxes.status === 'ready' && mailboxes.mailboxes.length > 0 && (
          <LinkCardGrid>
            {mailboxes.mailboxes.map((mailbox) => (
              <LinkCard key={mailbox.id} to={`/mailboxes/${mailbox.id}/members`} title={mailbox.display_name} text={mailbox.capabilities.manage_members ? `${mailbox.display_address ?? 'Mailbox'} · you can manage members` : `${mailbox.display_address ?? 'Mailbox'} · read-only membership`} />
            ))}
          </LinkCardGrid>
        )}
      </div>
      <AdministrationPage section="organization" />
    </div>
  )
}
