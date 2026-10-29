// Header search form: submits to /search with the query and optional mailbox scope in the URL
// (navigation and filter state belong in the URL). No request happens here.
import { useId, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useMailboxes } from './mailboxes'
import { inputClass } from '@/ui/Field'
import { Button } from '@/ui/Button'

export function SearchBox() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const mailboxes = useMailboxes()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [mailbox, setMailbox] = useState(params.get('mailbox') ?? '')
  const ids = { q: useId(), mailbox: useId() }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (q === '') return
    const next = new URLSearchParams({ q })
    if (mailbox !== '') next.set('mailbox', mailbox)
    navigate(`/search?${next.toString()}`)
  }

  return (
    <form role="search" aria-label="Search mail" onSubmit={submit} className="flex min-w-0 items-center gap-1">
      <label htmlFor={ids.q} className="sr-only">Search mail</label>
      <input
        id={ids.q}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={256}
        placeholder="Search"
        autoComplete="off"
        className={`h-8 w-28 min-w-0 sm:w-44 ${inputClass}`}
      />
      <label htmlFor={ids.mailbox} className="sr-only">Search scope</label>
      <select id={ids.mailbox} value={mailbox} onChange={(e) => setMailbox(e.target.value)} className={`hidden h-8 max-w-36 md:block ${inputClass}`}>
        <option value="">All mailboxes</option>
        {mailboxes.status === 'ready' && mailboxes.mailboxes.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
      </select>
      <Button type="submit" size="sm" variant="ghost" aria-label="Run search">Go</Button>
    </form>
  )
}
