import { Bot, CheckCircle2, MailQuestion, MonitorOff, PenLine, ShieldOff } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { gateway } from '@/data/gateway'
import { useData } from '@/data/store'
import { openDraft } from '@/features/compose/composerStore'
import { assistantQueue, describeAiAccess } from '@/domain/connections'
import { identityDomain } from '@/domain/identities'
import { lastMessage } from '@/domain/mail'
import type { Draft, Thread } from '@/domain/schema'
import { formatWhen } from '@/lib/format'
import { threadHref } from '@/lib/routes'
import { useOnline } from '@/ui/Async'
import { Badge } from '@/ui/Badge'
import { Callout, DomainDot, EmptyState, PageHeader, usePageTitle } from '@/ui/Bits'
import { Button, buttonClass } from '@/ui/Button'
import { toast } from '@/ui/toast'

function QueueRow({ thread, draft, online }: { thread: Thread; draft: Draft | undefined; online: boolean }) {
  const [busy, setBusy] = useState(false)
  const last = lastMessage(thread)

  const prepare = () => {
    setBusy(true)
    gateway
      .prepareAiDraft(thread.id)
      // No success toast: the row itself turns into "Draft ready", and a toast would cover the composer's send bar on phones.
      .catch((error: unknown) => toast(error instanceof Error ? error.message : 'The draft could not be prepared.', { tone: 'error' }))
      .finally(() => setBusy(false))
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 basis-64">
        <p className="flex items-center gap-2 text-sm">
          <span className="truncate font-semibold">{last.from.name}</span>
          <time dateTime={last.at} className="shrink-0 text-xs text-muted">
            {formatWhen(last.at)}
          </time>
        </p>
        <Link to={threadHref(thread)} className="block truncate text-[13px] hover:underline">
          {thread.subject}
        </Link>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <DomainDot domain={identityDomain(thread.identityId)} />
          <span className="truncate">{thread.identityId}</span>
        </p>
      </div>
      {draft ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success" icon={CheckCircle2}>
            Draft ready · not sent
          </Badge>
          <Button size="sm" variant="primary" onClick={() => openDraft(draft)} icon={<PenLine aria-hidden className="size-3.5" />}>
            Review draft
          </Button>
        </div>
      ) : (
        <Button size="sm" disabled={busy || !online} onClick={prepare} icon={<Bot aria-hidden className="size-3.5" />}>
          {busy ? 'Preparing…' : 'Prepare draft (simulated)'}
        </Button>
      )}
    </li>
  )
}

// AIDEV-NOTE: Preview of the assistant's one job: prepare reply drafts inside its read scope. It never sends from here.
export function AssistantPage() {
  usePageTitle('AI Assistant')
  const threads = useData((s) => s.threads)
  const drafts = useData((s) => s.drafts)
  const connections = useData((s) => s.connections)
  const online = useOnline()
  const queue = useMemo(() => assistantQueue(threads, connections), [threads, connections])
  // A reply draft for the conversation, however it was made, means the next step is review rather than another draft.
  const draftByThread = useMemo(() => new Map(drafts.flatMap((d) => (d.threadId ? [[d.threadId, d] as const] : []))), [drafts])
  const { ai } = connections
  const manage = (
    <Link to="/connections/ai" className={buttonClass('secondary')}>
      Manage AI access
    </Link>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="AI Assistant" description="Prepares reply drafts for you to review. You always send." actions={manage} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex max-w-4xl flex-col gap-5 p-4 md:p-6">
          <Callout tone="warn" icon={MonitorOff}>
            <p className="font-semibold">Preview: no AI is connected</p>
            <p className="mt-0.5">The real assistant runs through your own Codex CLI on the desktop app and cannot work in a browser or while your computer is off. Drafts made here are fixed placeholder text, labelled as simulated.</p>
          </Callout>

          <p className="text-[13px] text-muted">
            <span className="font-medium text-fg">Current access:</span> {describeAiAccess(ai)}
          </p>

          <section aria-labelledby="ai-queue" className="overflow-hidden rounded-xl border border-line">
            <h2 id="ai-queue" className="border-b border-line px-4 py-2.5 text-sm font-semibold">
              Waiting for your reply ({queue.length})
            </h2>
            {!ai.allowDrafts ? (
              <EmptyState icon={ShieldOff} title="Drafting is turned off" body="The assistant may not prepare drafts. Turn drafting on in Connections to use this page." action={manage} />
            ) : ai.readMailboxIds.length === 0 ? (
              <EmptyState icon={ShieldOff} title="No mailboxes selected" body="The assistant can read nothing until you choose at least one mailbox for it." action={manage} />
            ) : queue.length === 0 ? (
              <EmptyState icon={MailQuestion} title="Nothing is waiting" body="No conversation in the selected mailboxes is waiting for a reply." />
            ) : (
              <ul aria-label="Conversations waiting for a reply" className="divide-y divide-line">
                {queue.map((t) => (
                  <QueueRow key={t.id} thread={t} draft={draftByThread.get(t.id)} online={online} />
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-muted">Message content will be passed to the assistant marked as untrusted data. What can be enforced is its permissions: which connected mailboxes it may read, whether it may draft, and that nothing is sent without your approval. No setting can guarantee how an assistant interprets text inside an email, which is why every draft is yours to review. AI-assisted sends are planned to count toward the daily limit of the mailbox they leave from; that rule is still to be confirmed and this preview enforces nothing.</p>
        </div>
      </div>
    </div>
  )
}
