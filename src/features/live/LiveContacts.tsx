import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { createContactsGateway, type ContactPage } from '@/data/http/contactsGateway'
import { ApiFailure } from '@/data/http/httpClient'
import { http, live, useLive } from '@/data/http/instance'
import { Button } from '@/ui/Button'
import { Field, Input, Textarea } from '@/ui/Field'
import { usePageTitle } from '@/ui/Bits'

const contacts = createContactsGateway(http)
const failure = (error: unknown) => error instanceof Error ? error.message : 'The server could not complete this request.'

// AIDEV-NOTE: Account-keyed mounting clears contact data/forms; no contact content is persisted in the browser.
export function LiveContacts() {
  const accountId = useLive(state => state.accountId)
  usePageTitle('Contacts')
  return accountId ? <ContactsPanel key={accountId} accountId={accountId} /> : null
}
function ContactsPanel({ accountId }: { accountId: string }) {
  const [params, setParams] = useSearchParams()
  const after = params.get('after')
  const [page, setPage] = useState<ContactPage | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [addresses, setAddresses] = useState('')
  const [evidence, setEvidence] = useState('')
  const [optedIn, setOptedIn] = useState(false)
  const generation = useRef(0)
  const active = useRef(true)
  const current = useCallback(() => active.current && live.store.getState().accountId === accountId, [accountId])
  const reportFailure = useCallback((cause: unknown) => {
    setError(failure(cause))
    if (cause instanceof ApiFailure && cause.kind === 'unauthorized') {
      // AIDEV-NOTE: Clear private content immediately; session recheck owns the sign-in transition.
      generation.current++
      setPage(null); setAddresses(''); setEvidence(''); setOptedIn(false); setNotice(''); setLoading(false)
      void live.recheckSession()
    }
  }, [])
  const load = useCallback(async () => {
    const id = ++generation.current
    setLoading(true)
    setError('')
    setPage(null)
    try {
      const result = await contacts.list(after)
      if (current() && generation.current === id) setPage(result)
    } catch (cause) {
      if (current() && generation.current === id) reportFailure(cause)
    } finally {
      if (current() && generation.current === id) setLoading(false)
    }
  }, [after, current, reportFailure])
  useEffect(() => {
    active.current = true
    void load()
    // AIDEV-NOTE: Unmount blocks updates; the next load increments generation before awaiting its response.
    return () => { active.current = false }
  }, [load])
  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const emails = addresses.split(/\r?\n/u).map(value => value.trim()).filter(Boolean)
      const result = await contacts.import(emails.map(email => ({ email, consentSource: evidence, optedIn })))
      if (!current()) return
      setNotice(`${result.processed} contact${result.processed === 1 ? '' : 's'} saved. No email was sent.`)
      setAddresses('')
      setEvidence('')
      setOptedIn(false)
      if (after) setParams({})
      else await load()
    } catch (cause) {
      if (current()) reportFailure(cause)
    } finally {
      if (current()) setSaving(false)
    }
  }
  return <div className="h-full overflow-auto p-4 md:p-6">
    <h1 className="text-xl font-semibold">Contacts</h1>
    <p className="mt-1 text-sm text-muted">Your private contacts and consent records. Saving a contact never sends an email.</p>
    <form onSubmit={event => void save(event)} className="my-5 grid max-w-3xl gap-3 rounded-xl border border-line bg-surface p-4">
      <h2 className="font-semibold">Add or import contacts</h2>
      <Field label="Email addresses" hint="One address per line, up to 500. Use a separate import for each consent source.">
        {props => <Textarea {...props} required rows={3} maxLength={128000} value={addresses} onChange={event => setAddresses(event.target.value)} disabled={saving} />}
      </Field>
      <Field label="Consent or withdrawal evidence" hint="Record the signup source and date, or the withdrawal request. Do not invent consent.">
        {props => <Input {...props} required maxLength={1024} value={evidence} onChange={event => setEvidence(event.target.value)} disabled={saving} />}
      </Field>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={optedIn} disabled={saving} onChange={event => setOptedIn(event.target.checked)} />These people explicitly opted in to this outreach.</label>
      <p className="text-xs text-muted">Unchecked records are saved as withdrawn and blocked from outreach. Existing suppression stays blocked even if you check opt-in.</p>
      <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save contacts'}</Button>
    </form>
    {notice && <p role="status" className="mb-3 text-sm">{notice}</p>}
    {error && <div role="alert" className="mb-3 text-sm text-danger">{error} <Button onClick={() => void load()} disabled={loading}>Reload contacts</Button></div>}
    {loading && <p role="status" className="text-sm text-muted">Loading contacts…</p>}
    {!loading && page?.items.length === 0 && <p className="text-sm text-muted">No contacts on this page. Add your opted-in contacts above.</p>}
    {page && <div className="overflow-x-auto rounded-xl border border-line"><table className="w-full text-left text-sm">
      <thead className="bg-surface-2 text-muted"><tr><th className="p-3">Email</th><th className="p-3">Consent evidence</th><th className="p-3">Outreach status</th></tr></thead>
      <tbody>{page.items.map(row => <tr key={row.email} className="border-t border-line"><td className="p-3">{row.email}</td><td className="max-w-md break-words p-3">{row.consent_source}</td><td className="p-3">{row.suppression ? `Blocked: ${row.suppression}` : row.opted_in ? 'Opted in' : 'Not opted in'}</td></tr>)}</tbody>
    </table></div>}
    <div className="mt-3 flex gap-2">
      {after && <Button onClick={() => setParams({})} disabled={loading || saving}>First page</Button>}
      {page?.next && <Button onClick={() => setParams({ after: page.next! })} disabled={loading || saving}>Next page</Button>}
    </div>
  </div>
}
