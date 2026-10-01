import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { brandOf } from '@/domain/identities'
import { parseRichText, type Inline } from '@/domain/richText'
import type { DomainName } from '@/domain/schema'
import { cx } from '@/lib/format'
import { IconButton } from './Button'

// AIDEV-NOTE: Small presentational building blocks shared by every feature. Keep them free of data access.

export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · Outreach Mailroom`
  }, [title])
}

/** Changes once a minute. Time-range views depend on it so they do not go stale on a page left open. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

export function PageHeader({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="border-b border-line px-4 py-4 md:px-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  )
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Icon aria-hidden className="size-6" />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="max-w-sm text-[13px] text-muted">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-3 p-6">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-surface-2" style={{ width: `${90 - ((i * 13) % 40)}%` }} />
      ))}
    </div>
  )
}

/** Themed progress bar; the native <progress> ignores our accent token in some browsers. */
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100))
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-2 w-full overflow-hidden rounded-full border border-line bg-surface-2">
      <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
    </div>
  )
}

export const PAGE_SIZE = 50

/** Page number from untrusted input (a URL parameter or stale state), limited to the pages that exist. */
export function clampPage(raw: string | number | null, total: number): number {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.floor(Number(raw))
  return Number.isFinite(page) ? Math.min(pages, Math.max(1, page)) : 1
}

export function Pagination({ page, total, onPage, noun }: { page: number; total: number; onPage(page: number): void; noun: string }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(total, page * PAGE_SIZE)
  return (
    <div className="flex items-center justify-end gap-2 px-4 py-2 text-[13px] text-muted">
      <span aria-live="polite">
        {from}–{to} of {total} {noun}
      </span>
      <IconButton label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft aria-hidden className="size-4" />
      </IconButton>
      <IconButton label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        <ChevronRight aria-hidden className="size-4" />
      </IconButton>
    </div>
  )
}

function InlineNodes({ nodes }: { nodes: Inline[] }) {
  return nodes.map((node, i) => {
    if (node.kind === 'bold') return <strong key={i}>{node.text}</strong>
    if (node.kind === 'italic') return <em key={i}>{node.text}</em>
    if (node.kind === 'link')
      return (
        <a key={i} href={node.href} target="_blank" rel="noreferrer noopener" className="text-accent-text underline underline-offset-2">
          {node.text}
        </a>
      )
    return <span key={i}>{node.text}</span>
  })
}

/** Renders the markdown subset as React nodes — never as raw HTML. */
export function RichText({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-3 break-words leading-relaxed', className)}>
      {parseRichText(source).map((block, i) =>
        block.kind === 'list' ? (
          <ul key={i} className="list-disc pl-5">
            {block.items.map((item, j) => (
              <li key={j}>
                <InlineNodes nodes={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {block.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                <InlineNodes nodes={line} />
              </span>
            ))}
          </p>
        ),
      )}
    </div>
  )
}

// Fixed brand colours (not themed): each pairs with white text at ≥4.5:1.
const BRAND_COLORS: Record<DomainName, string> = { 'boltloop.co': '#1f2937', 'flooda.co': '#0e5a8a', 'elevateoco.com': '#5b2a86' }

export function BrandBanner({ domain, text }: { domain: DomainName; text?: string }) {
  return (
    <div className="rounded-lg px-4 py-3 text-center text-sm font-semibold tracking-wide text-white" style={{ backgroundColor: BRAND_COLORS[domain] }}>
      {text ?? brandOf(domain)}
    </div>
  )
}

export function UnsubscribeFooter({ text }: { text: string }) {
  return (
    <p className="border-t border-line pt-2 text-xs text-muted">
      {text} <span className="font-medium text-fg underline">Unsubscribe</span>
    </p>
  )
}

export function Callout({ tone, icon: Icon, children }: { tone: 'info' | 'warn' | 'danger'; icon: LucideIcon; children: ReactNode }) {
  const tones = { info: 'border-line bg-surface-2 text-fg', warn: 'border-warn/40 bg-warn/10 text-fg', danger: 'border-danger/40 bg-danger/10 text-fg' }
  return (
    <div className={cx('flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px]', tones[tone])}>
      <Icon aria-hidden className={cx('mt-0.5 size-4 shrink-0', tone === 'warn' && 'text-warn', tone === 'danger' && 'text-danger')} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
