// Flux code block (integration detail pages): dark pre with a top-end Copy button. Copy failures are
// reported inline rather than swallowed so the person knows to select the text by hand.
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
      className={cx('rounded-md px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-white/10 hover:text-zinc-100', className)}
      aria-live="polite"
    >
      {status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : label}
    </button>
  )
}

export function CodeBlock({ code, language, className }: { code: string; language?: string; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-4 pe-20 font-mono text-xs leading-5 text-zinc-100" data-language={language}>
        <code>{code}</code>
      </pre>
      <CopyButton text={code} className="absolute end-2 top-2" />
    </div>
  )
}
