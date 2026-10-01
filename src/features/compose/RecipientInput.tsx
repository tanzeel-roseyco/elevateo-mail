import { AlertTriangle, Ban, X } from 'lucide-react'
import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { EMAIL_PATTERN, sendBlockReason } from '@/domain/rules'
import type { Contact } from '@/domain/schema'
import { cx } from '@/lib/format'

interface Props {
  label: string
  value: string[]
  onChange(next: string[]): void
  contacts: Contact[]
  autoFocus?: boolean
}

/** Chip input for addresses. Commits on Enter, comma, space, Tab, paste, or blur; Backspace removes the last chip. */
export function RecipientInput({ label, value, onChange, contacts, autoFocus }: Props) {
  const [text, setText] = useState('')
  const id = useId()
  const byEmail = useMemo(() => new Map(contacts.map((c) => [c.email.toLowerCase(), c])), [contacts])

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase()
    if (q.length < 2) return []
    return contacts.filter((c) => !value.includes(c.email) && (c.email.includes(q) || c.name.toLowerCase().includes(q))).slice(0, 5)
  }, [text, contacts, value])

  const commit = (raw: string) => {
    const added = raw
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e && !value.includes(e))
    if (added.length > 0) onChange([...value, ...new Set(added)])
    setText('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',' || e.key === ' ' || (e.key === 'Tab' && !e.shiftKey)) && text.trim()) {
      // Tab should still move focus onward after committing; the other keys stay in the field.
      if (e.key !== 'Tab') e.preventDefault()
      commit(text)
    } else if (e.key === 'Backspace' && text === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="relative flex items-start gap-2 border-b border-line px-3 py-1.5">
      <label htmlFor={id} className="w-12 shrink-0 pt-1.5 text-[13px] text-muted">
        {label}
      </label>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {value.map((email) => {
          const invalid = !EMAIL_PATTERN.test(email)
          const contact = byEmail.get(email)
          const blocked = contact ? sendBlockReason(contact) : null
          return (
            <span key={email} className={cx('inline-flex max-w-full items-center gap-1 rounded-full border py-0.5 pl-2 pr-1 text-[13px]', invalid ? 'border-danger bg-danger/10' : blocked ? 'border-warn/50 bg-warn/10' : 'border-line bg-surface-2')}>
              {invalid && <AlertTriangle aria-hidden className="size-3.5 shrink-0 text-danger" />}
              {blocked && <Ban aria-hidden className="size-3.5 shrink-0 text-warn" />}
              <span className="truncate">{contact ? `${contact.name} <${email}>` : email}</span>
              {invalid && <span className="sr-only"> (invalid address)</span>}
              {blocked && <span className="sr-only"> ({blocked})</span>}
              <button type="button" aria-label={`Remove ${email}`} className="rounded-full p-0.5 hover:bg-line" onClick={() => onChange(value.filter((v) => v !== email))}>
                <X aria-hidden className="size-3" />
              </button>
            </span>
          )
        })}
        <input
          id={id}
          type="text"
          inputMode="email"
          autoComplete="off"
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => text.trim() && commit(text)}
          onPaste={(e) => {
            e.preventDefault()
            // Honour the caret and selection, as a native paste would, before splitting into addresses.
            const start = e.currentTarget.selectionStart ?? text.length
            const end = e.currentTarget.selectionEnd ?? text.length
            commit(text.slice(0, start) + e.clipboardData.getData('text') + text.slice(end))
          }}
          className="h-7 min-w-32 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      {suggestions.length > 0 && (
        <ul className="absolute left-14 right-3 top-full z-10 rounded-lg border border-line bg-surface py-1 shadow-lg" aria-label={`${label} suggestions`}>
          {suggestions.map((c) => (
            <li key={c.id}>
              {/* onMouseDown keeps the input from blurring (and committing half-typed text) before the pick lands. */}
              <button type="button" className="block w-full truncate px-3 py-1.5 text-left text-[13px] hover:bg-surface-2" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange([...value, c.email]); setText('') }}>
                <span className="font-medium">{c.name}</span> <span className="text-muted">{c.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
