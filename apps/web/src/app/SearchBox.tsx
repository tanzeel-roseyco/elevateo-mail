// Search form: submits to /search with the query and optional mailbox scope in the URL
// (navigation and filter state belong in the URL). No request happens here.
// Two looks (INBOX-SPEC §2 "search input"): `header` is the compact h-10 field with a magnifier
// in the inbox page header; `expanded` is the full form with a visible scope select on /search.
import { useId, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useMailboxes } from './mailboxes'
import { inputClass, Select } from '@/ui/Field'
import { Button } from '@/ui/Button'
import { MagnifyingGlassIcon } from '@/ui/icons'
import { cx } from '@/lib/format'

export function SearchBox({ expanded = false, variant = expanded ? 'expanded' : 'header' }: { expanded?: boolean; variant?: 'header' | 'expanded' }) {
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
  const full = variant === 'expanded'

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
      aria-label={full ? 'Search conversations' : 'Search mail'}
      onSubmit={submit}
      onFocusCapture={() => { if (!editing) { setDraft(fields); setEditing(true) } }}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setEditing(false) }}
      className={full ? 'mb-6 flex w-full max-w-xl flex-wrap items-end gap-3' : 'flex min-w-0 items-center gap-2'}
    >
      {/* AIDEV-NOTE: Keep each visible label with its control when the expanded form wraps on mobile. */}
      <div className={full ? 'flex min-w-0 flex-1 basis-64 flex-col gap-1' : 'relative'}>
        <label htmlFor={ids.q} className={full ? 'text-sm font-medium text-fg ' : 'sr-only'}>Search mail</label>
        <div className="relative">
          <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <input
            id={ids.q}
            type="search"
            value={q}
            onChange={(e) => { setDraft({ ...fields, q: e.target.value }); setEditing(true) }}
            maxLength={512}
            placeholder="Search"
            autoComplete="off"
            className={cx(inputClass, 'ps-10', full ? 'w-full' : 'w-48 sm:w-64')}
          />
        </div>
      </div>
      <div className={full ? 'flex min-w-0 flex-1 basis-48 flex-col gap-1 sm:flex-none' : 'contents'}>
        <label htmlFor={ids.mailbox} className={full ? 'text-sm font-medium text-fg ' : 'sr-only'}>Search scope</label>
        <Select id={ids.mailbox} value={mailbox} onChange={(e) => { setDraft({ ...fields, mailbox: e.target.value }); setEditing(true) }} className={full ? 'w-full min-w-0' : 'hidden max-w-40 md:block'}>
          <option value="">All mailboxes</option>
          {mailbox !== '' && (mailboxes.status !== 'ready' || !mailboxes.mailboxes.some((m) => m.id === mailbox)) && (
            <option value={mailbox}>Selected mailbox (unavailable)</option>
          )}
          {mailboxes.status === 'ready' && mailboxes.mailboxes.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
        </Select>
      </div>
      <Button type="submit" variant={full ? 'primary' : 'ghost'} aria-label="Run search">{full ? 'Search' : 'Go'}</Button>
    </form>
  )
}
