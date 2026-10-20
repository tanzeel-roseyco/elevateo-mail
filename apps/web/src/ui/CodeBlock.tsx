// Flux code block (integration detail pages, DESIGN-SPEC §5): light zinc-50 pre with a hairline and
// a top-end Copy button. Copy failures are reported inline rather than swallowed so the person knows
// to select the text by hand.
import { useEffect, useState } from 'react'
import { copyText } from '@/lib/clipboard'
import { cx } from '@/lib/format'

type CopyStatus = 'idle' | 'copied' | 'failed'

export function useCopy(): [CopyStatus, (text: string) => Promise<void>] {
  const [status, setStatus] = useState<CopyStatus>('idle')
  // The attempt counter restarts the 2s timer when the same status repeats (copy, copy again).
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (status === 'idle') return
    const timer = setTimeout(() => setStatus('idle'), 2000)
    return () => clearTimeout(timer)
  }, [status, attempt])
  const copy = async (text: string) => {
    const ok = await copyText(text)
    setStatus(ok ? 'copied' : 'failed')
    setAttempt((n) => n + 1)
  }
  return [status, copy]
}

export function CopyButton({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) {
  const [status, copy] = useCopy()
  return (
    <button
      type="button"
      onClick={() => void copy(text)}
      className={cx('rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white', className)}
      aria-live="polite"
    >
      {status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : label}
    </button>
  )
}

export function CodeBlock({ code, language, className }: { code: string; language?: string; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      {/* DESIGN-SPEC §5 "Code block with copy": rounded-lg bg-zinc-50 border-zinc-200 font-mono text-sm px-3 py-2. */}
      <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 pe-20 font-mono text-sm leading-6 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" data-language={language}>
        <code>{code}</code>
      </pre>
      {/* The fade gives Copy an opaque surface: long lines scroll under it instead of through it (390px). */}
      <span aria-hidden className="pointer-events-none absolute inset-y-px end-px w-20 rounded-e-lg bg-linear-to-l from-zinc-50 from-60% to-transparent dark:from-zinc-900" />
      <CopyButton text={code} className="absolute end-2 top-2 bg-zinc-50 dark:bg-zinc-900" />
    </div>
  )
}
