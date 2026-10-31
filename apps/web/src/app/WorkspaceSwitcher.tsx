// Sidebar workspace select (DESIGN-SPEC §3): the Flux searchable select bound to the real
// organization list and the explicit organization switch (BE-02A). A successful switch replaces
// the session identity, which remounts the protected subtree and this control with it.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { Session } from '@/data/contract'
import { cx } from '@/lib/format'
import { Skeleton } from '@/ui/Async'
import { Button, IconButton } from '@/ui/Button'
import { CheckMiniIcon, ChevronUpDownMiniIcon, MagnifyingGlassMiniIcon, XMarkMiniIcon } from '@/ui/icons'
import { useOrganizations } from './organizations'
import { useSession } from './session'

export function WorkspaceSwitcher({ session }: { session: Session }) {
  const { switchOrganization } = useSession()
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const organizations = useOrganizations(open, attempt)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listId = useId()
  const current = session.organization

  const close = (restoreFocus: boolean) => {
    setOpen(false)
    setQuery('')
    setFailure(null)
    if (restoreFocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return
      setOpen(false)
      setQuery('')
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const choose = async (organizationId: string) => {
    if (pendingId !== null || organizationId === current.id) return
    setPendingId(organizationId)
    setFailure(null)
    const result = await switchOrganization(organizationId)
    // 'ok' replaces the identity and unmounts this control; only a failure needs rendering here.
    if (result.kind === 'failed') {
      setPendingId(null)
      setFailure(result.failure.message)
    } else if (result.kind === 'superseded') {
      setPendingId(null)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const options = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])
    if (options.length === 0) return
    event.preventDefault()
    const index = options.findIndex((option) => option === document.activeElement)
    // From the search field (no active option) Down goes to the first item and Up to the last.
    const next = index === -1 ? (event.key === 'ArrowDown' ? 0 : options.length - 1) : event.key === 'ArrowDown' ? (index + 1) % options.length : (index - 1 + options.length) % options.length
    options[next]?.focus()
  }

  const needle = query.trim().toLowerCase()
  const visible = organizations.status === 'ready' ? organizations.items.filter((o) => o.name.toLowerCase().includes(needle)) : []

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Workspace: ${current.name}`}
        onClick={() => (open ? close(true) : setOpen(true))}
        className="flex h-10 w-full items-center gap-2 overflow-hidden rounded-lg border border-line border-b-line bg-surface px-3 py-2 text-base shadow-xs sm:text-sm  "
      >
        <span className="flex-1 truncate text-start text-fg ">{current.name}</span>
        <ChevronUpDownMiniIcon className="size-4 shrink-0 text-muted" />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 flex min-w-48 flex-col rounded-lg border border-line bg-surface p-[.3125rem] shadow-xs  ">
          <div className="relative -mx-[5px] -mt-[5px] mb-[5px] flex grow">
            <span aria-hidden className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-muted">
              <MagnifyingGlassMiniIcon className="size-4" />
            </span>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search workspaces..."
              aria-label="Search workspaces"
              className="h-10 w-full border-b border-line bg-surface px-3 pe-9 ps-9 text-base font-medium text-fg outline-hidden placeholder:font-normal sm:text-sm   "
            />
            {query !== '' && (
              <span className="absolute inset-y-0 end-0 flex items-center pe-1">
                <IconButton label="Clear search" variant="subtle" onClick={() => setQuery('')} className="rounded-md">
                  <XMarkMiniIcon className="size-4" />
                </IconButton>
              </span>
            )}
          </div>
          <div id={listId} role="listbox" aria-label="Workspaces" className="max-h-[20rem] overflow-y-auto">
            {organizations.status === 'loading' || organizations.status === 'idle' ? (
              <div role="status" aria-label="Loading workspaces" className="p-1"><Skeleton rows={3} /></div>
            ) : organizations.status === 'error' ? (
              <div role="alert" className="p-2">
                <p className="text-sm text-muted">{organizations.message}</p>
                <Button size="sm" className="mt-2" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
              </div>
            ) : visible.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted ">No results found</p>
            ) : (
              visible.map((organization) => {
                const selected = organization.id === current.id
                const switching = organization.id === pendingId
                return (
                  <button
                    key={organization.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    tabIndex={-1}
                    disabled={pendingId !== null}
                    onClick={() => void choose(organization.id)}
                    className={cx(
                      'flex w-full items-center rounded-md px-2 py-1.5 text-start text-sm font-medium text-fg hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none disabled:opacity-50  ',
                      selected && 'disabled:opacity-100',
                    )}
                  >
                    <span className="flex w-7 shrink-0 items-center">{selected && <CheckMiniIcon className="size-4" />}</span>
                    <span className="min-w-0 flex-1 truncate">{organization.name}</span>
                    {switching && <span className="ms-2 shrink-0 text-xs text-muted">Switching…</span>}
                  </button>
                )
              })
            )}
            {organizations.status === 'ready' && organizations.incomplete && (
              <p className="px-2 py-1.5 text-xs text-muted">More workspaces exist than are listed here.</p>
            )}
          </div>
          {failure && <p role="alert" className="px-2 py-1.5 text-sm font-medium text-danger">{failure}</p>}
        </div>
      )}
    </div>
  )
}
