import { Ban, Info, Mail, Search, Upload, Users } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useData } from '@/data/store'
import { EVENT_LABELS } from '@/domain/activity'
import { contactMatches, sendBlockReason } from '@/domain/rules'
import type { Contact } from '@/domain/schema'
import { openComposer } from '@/features/compose/composerStore'
import { formatDateTime } from '@/lib/format'
import { Badge, StatusBadge } from '@/ui/Badge'
import { Callout, clampPage, EmptyState, PAGE_SIZE, PageHeader, Pagination, usePageTitle } from '@/ui/Bits'
import { Button, buttonClass } from '@/ui/Button'
import { confirm } from '@/ui/confirm'
import { Modal } from '@/ui/Modal'
import { toast } from '@/ui/toast'
import { eventHref } from '@/lib/routes'

const STATUS_FILTERS = [
  { id: '', label: 'All contacts', test: () => true },
  { id: 'subscribed', label: 'Subscribed', test: (c: Contact) => c.subscription === 'subscribed' },
  { id: 'unsubscribed', label: 'Unsubscribed', test: (c: Contact) => c.subscription === 'unsubscribed' },
  { id: 'bounced', label: 'Bounced', test: (c: Contact) => c.subscription === 'bounced' },
  { id: 'suppressed', label: 'Suppressed', test: (c: Contact) => c.subscription === 'suppressed' },
  { id: 'unconfirmed', label: 'Consent unconfirmed', test: (c: Contact) => c.consent === 'unconfirmed' },
  { id: 'blocked', label: 'Cannot receive campaigns', test: (c: Contact) => sendBlockReason(c) !== null },
] as const

/** Side panel with the minimum needed to act on a contact: status, consent source, and communication history. */
function ContactPanel({ contact, onClose }: { contact: Contact; onClose(): void }) {
  const events = useData((s) => s.events)
  const updateContact = useData((s) => s.updateContact)
  const history = useMemo(() => events.filter((e) => e.email === contact.email).slice(0, 20), [events, contact.email])
  const reason = sendBlockReason(contact)

  const suppress = async () => {
    if (!(await confirm({ title: `Suppress ${contact.name}?`, body: 'They will be excluded from all campaign sends until you remove the suppression.', confirmLabel: 'Add to suppression list', danger: true }))) return
    updateContact(contact.id, { subscription: 'suppressed' })
    toast('Contact added to the suppression list.')
  }

  const threads = useData((s) => s.threads)
  return (
    <Modal open onOpenChange={(isOpen) => !isOpen && onClose()} title={contact.name} description={`${contact.company} · ${contact.email}`} side="right">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={contact.subscription} />
          <StatusBadge status={contact.consent} />
          {contact.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
        <p className="text-[13px] text-muted">Consent source: {contact.consentSource}</p>
        {reason && (
          <Callout tone="warn" icon={Ban}>
            This contact is {reason}. Campaign emails to them are blocked.
          </Callout>
        )}
        <div className="flex flex-wrap gap-2">
          <Button icon={<Mail aria-hidden className="size-4" />} onClick={() => { openComposer({ to: [contact.email] }); onClose() }}>
            Email contact
          </Button>
          {contact.subscription === 'subscribed' && (
            <Button icon={<Ban aria-hidden className="size-4" />} onClick={() => void suppress()}>
              Suppress
            </Button>
          )}
          {contact.subscription === 'suppressed' && (
            <Button onClick={() => { updateContact(contact.id, { subscription: 'subscribed' }); toast('Suppression removed.') }}>Remove suppression</Button>
          )}
        </div>
        {(contact.subscription === 'unsubscribed' || contact.subscription === 'bounced') && (
          <p className="text-xs text-muted">{contact.subscription === 'unsubscribed' ? 'Only the recipient can resubscribe; this cannot be reversed here.' : 'Bounced addresses stay blocked to protect sender reputation.'}</p>
        )}
        <section aria-labelledby="contact-history">
          <h3 id="contact-history" className="text-sm font-semibold">
            Communication history
          </h3>
          {history.length === 0 ? (
            <p className="mt-1 text-[13px] text-muted">No emails have been exchanged with this contact.</p>
          ) : (
            <ol className="mt-2 flex flex-col">
              {history.map((e) => (
                <li key={e.id} className="flex items-baseline gap-3 border-b border-line py-1.5 text-[13px] last:border-b-0">
                  <Link to={eventHref(e, threads)} className="w-32 shrink-0 font-medium hover:underline">
                    {EVENT_LABELS[e.kind]}
                  </Link>
                  <time dateTime={e.at} className="text-muted">
                    {formatDateTime(e.at)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Modal>
  )
}

export function ContactsPage() {
  usePageTitle('Contacts')
  const [search, setSearch] = useSearchParams()
  const contacts = useData((s) => s.contacts)
  const q = search.get('q') ?? ''
  const status = STATUS_FILTERS.find((f) => f.id === search.get('status')) ?? STATUS_FILTERS[0]
  const openContact = contacts.find((c) => c.id === search.get('contact'))

  const setParam = (key: string, value: string, keepPage = false) => {
    const next = new URLSearchParams(search)
    if (value) next.set(key, value)
    else next.delete(key)
    if (!keepPage) next.delete('page')
    setSearch(next, { replace: key !== 'contact' })
  }

  const rows = useMemo(() => contacts.filter((c) => status.test(c) && contactMatches(c, q)), [contacts, status, q])
  const page = clampPage(search.get('page'), rows.length)
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const importLink = (
    <Link to="/contacts/import" className={buttonClass('primary')}>
      <Upload aria-hidden className="size-4" />
      Import CSV
    </Link>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Contacts" description={`${contacts.length} contacts. Only opted-in, subscribed contacts can receive campaign emails.`} actions={importLink}>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <input type="search" aria-label="Search contacts" placeholder="Search name, email, company, tag" value={q} onChange={(e) => setParam('q', e.target.value)} className="h-9 w-full rounded-lg border border-line bg-surface pl-8 pr-2 text-[13px]" />
          </div>
          <select aria-label="Filter by status" value={status.id} onChange={(e) => setParam('status', e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px]">
            {STATUS_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto">
        {contacts.length === 0 ? (
          <EmptyState icon={Users} title="No contacts yet" body="Import a CSV of opted-in contacts to get started." action={importLink} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Search} title="No contacts match" body="Try a different search or status." action={<Button onClick={() => setSearch({}, { replace: true })}>Clear filters</Button>} />
        ) : (
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <caption className="sr-only">Contacts</caption>
            <thead className="sticky top-0 z-10 bg-surface-2 text-xs text-muted">
              <tr>
                {['Name', 'Email', 'Company', 'Tags', 'Consent', 'Subscription'].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} className="border-b border-line hover:bg-surface-2">
                  <th scope="row" className="row whitespace-nowrap px-4 font-medium">
                    <button type="button" className="text-left hover:underline" onClick={() => setParam('contact', c.id, true)}>
                      {c.name}
                    </button>
                  </th>
                  <td className="row px-4 text-muted">{c.email}</td>
                  <td className="row px-4">{c.company}</td>
                  <td className="row px-4">
                    <span className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </span>
                  </td>
                  <td className="row px-4">
                    <StatusBadge status={c.consent} />
                  </td>
                  <td className="row px-4">
                    <StatusBadge status={c.subscription} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {rows.length > 0 && <Pagination page={page} total={rows.length} noun="contacts" onPage={(p) => setParam('page', p > 1 ? String(p) : '', true)} />}
      {search.get('contact') && !openContact && (
        <div className="border-t border-line p-3">
          <Callout tone="info" icon={Info}>
            That contact no longer exists.
          </Callout>
        </div>
      )}
      {openContact && <ContactPanel contact={openContact} onClose={() => setParam('contact', '', true)} />}
    </div>
  )
}
