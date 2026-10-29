// Gmail compose window in the Flux skin (INBOX-SPEC §2 "Compose window"): fixed bottom-right
// 540px card with minimise / maximise / close at ≥768px, fullscreen below. It only frames the
// draft editor: every field, save and review rule stays in DraftEditorPage.
//
// AIDEV-NOTE: Minimise hides the body visually (the editor stays mounted so unsaved text is never
// lost); close navigates back to the drafts list, which the editor's write-through intent store
// already survives.
// AIDEV-NOTE: Both window sizes reserve measured notices so the editor footer stays reachable.
import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { cx } from '@/lib/format'
import { IconButton } from '@/ui/Button'
import { ArrowsPointingOutIcon, MinusIcon, XMarkIcon } from '@/ui/icons'

export function ComposeWindow({ title = 'New message', children }: { title?: string; children: ReactNode }) {
  const navigate = useNavigate()
  const { mailboxId } = useParams<{ mailboxId: string }>()
  const [minimised, setMinimised] = useState(false)
  const [maximised, setMaximised] = useState(false)
  const close = () => navigate(mailboxId === undefined ? '/inbox' : `/mailboxes/${mailboxId}/drafts`)
  // Minimised wins: a minimised window docks at the bottom even if it was maximised before.
  const wide = maximised && !minimised
  return (
    <section
      aria-label="Compose"
      className={cx(
        'z-20 flex flex-col overflow-hidden border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800',
        'fixed bottom-[var(--bottom-notices)] max-md:inset-x-0 max-md:top-0',
        'md:end-6 md:rounded-t-xl',
        wide ? 'md:end-6 md:top-6 md:w-[min(900px,calc(100vw-3rem))]' : 'md:w-[540px]',
        minimised ? 'md:max-h-10' : 'md:max-h-[min(640px,calc(100dvh-2rem-var(--bottom-notices)))]',
      )}
    >
      <header className="flex h-10 shrink-0 items-center gap-1 border-b border-zinc-200 bg-zinc-50 px-3 text-sm font-medium text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <IconButton label={minimised ? 'Expand' : 'Minimise'} onClick={() => setMinimised((m) => !m)} aria-expanded={!minimised} className="max-md:hidden">
          <MinusIcon className="size-5" />
        </IconButton>
        <IconButton label={maximised ? 'Restore size' : 'Maximise'} onClick={() => { setMaximised((m) => !m); setMinimised(false) }} aria-pressed={maximised} className="max-md:hidden">
          <ArrowsPointingOutIcon className="size-5" />
        </IconButton>
        <IconButton label="Close compose" onClick={close}>
          <XMarkIcon className="size-5" />
        </IconButton>
      </header>
      <div className={cx('min-h-0 flex-1 overflow-y-auto', minimised && 'md:hidden')}>{children}</div>
    </section>
  )
}
