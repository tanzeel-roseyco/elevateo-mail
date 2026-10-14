// Header search form: submits to /search with the query and optional mailbox scope in the URL
// (navigation and filter state belong in the URL). No request happens here.
import { useId, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useMailboxes } from './mailboxes'
import { inputClass } from '@/ui/Field'
import { Button } from '@/ui/Button'

export function SearchBox({ expanded = false }: { expanded?: boolean }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const mailboxes = useMailboxes()
  const fromUrl = { q: params.get('q') ?? '', mailbox: params.get('mailbox') ?? '' }
  const [draft, setDraft] = useState(fromUrl)
  const [editing, setEditing] = useState(false)
  // AIDEV-NOTE: URL changes refresh idle fields; a focused form keeps its draft until focus leaves.
  const fields = editing ? draft : fromUrl
  const { q, mailbox } = fields
  const ids = { q: useId(), mailbox: useId() }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (q === '') return
    const next = new URLSearchParams({ q })
    if (mailbox !== '') next.set('mailbox', mailbox)
    setEditing(false)
    navigate(`/search?${next.toString()}`)
  }

  return (
    <form
      role="search"
      aria-label={expanded ? 'Search conversations' : 'Search mail'}
      onSubmit={submit}
      onFocusCapture={() => { if (!editing) { setDraft(fields); setEditing(true) } }}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setEditing(false) }}
      className={expanded ? 'mb-4 flex min-w-0 flex-wrap items-center gap-2' : 'flex min-w-0 items-center gap-1'}
    >
      <label htmlFor={ids.q} className={expanded ? 'text-sm' : 'sr-only'}>Search mail</label>
      <input
        id={ids.q}
        type="search"
        value={q}
        onChange={(e) => { setDraft({ ...fields, q: e.target.value }); setEditing(true) }}
        maxLength={512}
        placeholder="Search"
        autoComplete="off"
        className={`${expanded ? 'h-9 min-w-0 flex-1 basis-40' : 'h-8 w-28 min-w-0 sm:w-44'} ${inputClass}`}
      />
      <label htmlFor={ids.mailbox} className={expanded ? 'text-sm' : 'sr-only'}>Search scope</label>
      <select id={ids.mailbox} value={mailbox} onChange={(e) => { setDraft({ ...fields, mailbox: e.target.value }); setEditing(true) }} className={`${expanded ? 'h-9 min-w-0 max-w-full' : 'hidden h-8 max-w-36 md:block'} ${inputClass}`}>
        <option value="">All mailboxes</option>
        {mailbox !== '' && (mailboxes.status !== 'ready' || !mailboxes.mailboxes.some((m) => m.id === mailbox)) && (
          <option value={mailbox}>Selected mailbox (unavailable)</option>
        )}
        {mailboxes.status === 'ready' && mailboxes.mailboxes.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
      </select>
      <Button type="submit" size="sm" variant="ghost" aria-label="Run search">Go</Button>
    </form>
  )
}
