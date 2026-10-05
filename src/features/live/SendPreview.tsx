import type { SendContent } from '@/domain/sendLifecycle'

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex gap-3 px-4 py-2 text-[13px]">
      <dt className="w-16 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{value}</dd>
    </div>
  )
}

/** The exact content of a send request, shown as text. Used for review and for the approval screen. */
export function SendPreview({ content, from }: { content: Pick<SendContent, 'to' | 'cc' | 'bcc' | 'subject' | 'body'>; from: string }) {
  return (
    <section aria-label="Message to be sent" className="overflow-hidden rounded-xl border border-line">
      <dl className="divide-y divide-line">
        <Row label="From" value={from} />
        <Row label="To" value={content.to.join(', ')} />
        <Row label="CC" value={content.cc.join(', ')} />
        <Row label="BCC" value={content.bcc.join(', ')} />
        <Row label="Subject" value={content.subject} />
      </dl>
      <pre className="whitespace-pre-wrap break-words border-t border-line bg-surface-2 px-4 py-3 font-sans text-sm leading-relaxed">{content.body}</pre>
    </section>
  )
}
