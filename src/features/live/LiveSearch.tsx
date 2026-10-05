import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { createSearchGateway, type SearchPage } from '@/data/http/searchGateway'
import type { MessageCursor, ServerMailbox } from '@/data/http/contract'
import { ApiFailure } from '@/data/http/httpClient'
import { http, live, useLive } from '@/data/http/instance'
import { Button } from '@/ui/Button'
import { Field, Input, Select } from '@/ui/Field'
import { usePageTitle } from '@/ui/Bits'

const gateway = createSearchGateway(http)
export function LiveSearch() {
  const account = useLive(state => state.accountId)
  const mailboxes = useLive(state => state.mailboxes)
  usePageTitle('Search mail')
  // AIDEV-NOTE: Inventory changes reset selection/results, including mailbox lists arriving after session hydration.
  return account ? <Panel key={`${account}/${mailboxes.map(item => item.id).join(',')}`} account={account} mailboxes={mailboxes} /> : null
}
function Panel({ account, mailboxes }: { account: string; mailboxes: ServerMailbox[] }) {
  const [params] = useSearchParams()
  const [mailbox, setMailbox] = useState(() => mailboxes.find(item => item.id === params.get('mailboxId'))?.id ?? mailboxes[0]?.id ?? '')
  const [text, setText] = useState('')
  const [page, setPage] = useState<SearchPage | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [expired, setExpired] = useState(false)
  const active = useRef(true)
  const generation = useRef(0)
  const lock = useRef(false)
  const current = () => active.current && live.store.getState().accountId === account
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const reset = () => { generation.current++; setPage(null); setError('') }
  // AIDEV-NOTE: Never automatically walk search cursors; one click pays for at most one bounded metadata window.
  async function search(cursor: MessageCursor | null) {
    if (lock.current || !current()) return
    const revision = ++generation.current
    lock.current = true; setBusy(true); setError('')
    try {
      const result = await gateway.search(mailbox, text, cursor)
      if (current() && revision === generation.current) setPage(result)
    } catch (cause) {
      if (!current() || revision !== generation.current) return
      setPage(null); setError('Search could not be completed. Try again from the newest messages.')
      if (cause instanceof ApiFailure && cause.kind === 'unauthorized') { setText(''); setExpired(true); void live.recheckSession() }
    } finally { lock.current = false; if (current()) setBusy(false) }
  }
  const submit = (event: FormEvent) => { event.preventDefault(); void search(null) }
  if (expired) return <p role="alert">Your session expired. Sign in again to search mail.</p>
  return <div className="h-full overflow-auto p-4 md:p-6">
    <h1 className="text-xl font-semibold">Search mail</h1>
    <p className="mt-2 text-sm text-muted">Find text in stored subjects and sender addresses. Each search checks up to 1,000 messages; continue to check older mail. Bodies and attachments are not searched.</p>
    <form onSubmit={submit} className="mt-4 flex max-w-2xl flex-col gap-3">
      <Field label="Mailbox">{props => <Select {...props} disabled={busy} value={mailbox} onChange={event => { reset(); setMailbox(event.target.value) }}>
        {mailboxes.map(item => <option key={item.id} value={item.id}>{item.address}</option>)}
      </Select>}</Field>
      <Field label="Subject or sender">{props => <Input {...props} minLength={3} maxLength={100} required disabled={busy} value={text} onChange={event => { reset(); setText(event.target.value) }} />}</Field>
      <Button type="submit" variant="primary" disabled={busy || !mailbox || text.trim().length < 3}>{busy ? 'Searching…' : 'Search newest messages'}</Button>
    </form>
    {!mailboxes.length && <p className="mt-4 text-sm">Connect a mailbox or load disconnected mailbox history before searching.</p>}
    {error && <p role="alert" className="mt-4 text-sm">{error}</p>}
    {page && <section aria-label="Search results" className="mt-5 max-w-3xl">
      <p role="status" className="text-sm text-muted">{page.items.length} matches · {page.search.scanned} messages checked in this window</p>
      {!page.items.length && <p className="mt-3 text-sm">No matches in this window.{page.next ? ' Older mail remains to be checked.' : ' You have reached the end of stored mail.'}</p>}
      <ul className="mt-3 divide-y divide-line">{page.items.map(item => <li key={item.id}>
        <Link className="block rounded-lg p-3 hover:bg-surface-2" to={`/mail/${item.mailboxId}/${item.id}`}><span className="block break-all text-sm font-semibold">{item.subject || '(no subject)'}</span><span className="block break-all text-sm text-muted">{item.sender}</span></Link>
      </li>)}</ul>
      {page.next && <Button className="mt-4" disabled={busy} onClick={() => void search(page.next)}>Continue search in older messages</Button>}
    </section>}
  </div>
}
