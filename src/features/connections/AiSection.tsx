import { Info, MonitorOff } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { gateway } from '@/data/gateway'
import { useData } from '@/data/store'
import { identityDomain } from '@/domain/identities'
import type { AiAccess } from '@/domain/schema'
import { Badge } from '@/ui/Badge'
import { Callout, DomainDot } from '@/ui/Bits'
import { Switch } from '@/ui/Field'
import { toast } from '@/ui/toast'

// AIDEV-NOTE: AI access scope. The browser cannot reach a local CLI, so status is always "not available here".
export function AiSection() {
  const mailboxes = useData((s) => s.connections.mailboxes)
  const ai = useData((s) => s.connections.ai)

  // One change at a time: each patch is built from the scope on screen, so a second click before the first
  // is acknowledged would be built from stale state and could silently re-grant a mailbox just revoked.
  const [pending, setPending] = useState(false)
  const update = (patch: Partial<AiAccess>) => {
    setPending(true)
    gateway
      .updateAiAccess(patch)
      .catch((error: unknown) => toast(error instanceof Error ? error.message : 'The change could not be saved.', { tone: 'error' }))
      .finally(() => setPending(false))
  }
  const toggleMailbox = (id: string, readable: boolean) => update({ readMailboxIds: readable ? [...ai.readMailboxIds, id] : ai.readMailboxIds.filter((m) => m !== id) })

  return (
    <div className="mt-4 flex flex-col gap-6">
      <Callout tone="warn" icon={MonitorOff}>
        <p className="font-semibold">The assistant is not available in the browser</p>
        <p className="mt-0.5">It will run through your own Codex CLI account on the desktop app, with Claude CLI as a fallback. A web page cannot reach a program on your computer, and the assistant cannot work while your computer is off.</p>
      </Callout>

      <section aria-labelledby="cx-ai-providers" className="flex flex-col gap-2">
        <h3 id="cx-ai-providers" className="text-base font-semibold">
          Local AI programs
        </h3>
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line text-sm">
          <li className="flex flex-wrap items-center gap-2 px-4 py-3">
            <span className="font-semibold">Codex CLI</span>
            <Badge tone="accent">Primary</Badge>
            <Badge tone="neutral">Not detected · desktop app only</Badge>
          </li>
          <li className="flex flex-wrap items-center gap-2 px-4 py-3">
            <span className="font-semibold">Claude CLI</span>
            <Badge tone="neutral">Fallback</Badge>
            <Badge tone="neutral">Not detected · desktop app only</Badge>
          </li>
        </ul>
        <p className="text-xs text-muted">Each person signs in to their own CLI account on their own computer. Elevateo Mail never sees that sign-in.</p>
      </section>

      <fieldset disabled={pending} className="flex flex-col gap-2">
        <legend className="text-base font-semibold">Mailboxes the assistant may read</legend>
        <p className="text-[13px] text-muted">It can read nothing outside this list. {ai.readMailboxIds.length} of {mailboxes.length} selected.</p>
        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {mailboxes.map((m) => (
            <label key={m.id} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface-2">
              <input type="checkbox" className="size-4 shrink-0 accent-(--accent)" checked={ai.readMailboxIds.includes(m.id)} onChange={(e) => toggleMailbox(m.id, e.target.checked)} />
              <DomainDot domain={identityDomain(m.address)} />
              <span className="truncate" title={m.address}>
                {m.address}
              </span>
              {m.status !== 'connected' && <span className="shrink-0 text-xs text-muted">(not connected: unreadable)</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <section aria-labelledby="cx-ai-actions" className="flex flex-col gap-4">
        <h3 id="cx-ai-actions" className="text-base font-semibold">
          What it may do
        </h3>
        <Switch label="Prepare drafts" description="Writes a reply as a draft for you to read, edit and send yourself." checked={ai.allowDrafts} disabled={pending} onChange={(allowDrafts) => update({ allowDrafts })} />
        <Switch label="Send with my approval" description="Off by default. When on, the assistant may send a message only after you approve that exact version; any edit needs a new approval." checked={ai.allowSend} disabled={pending} onChange={(allowSend) => update({ allowSend })} />
      </section>

      <Callout tone="info" icon={Info}>
        Email content will be passed to the assistant marked as untrusted data. What can be enforced is its permissions: it is given no shell, no general file access and no mailbox outside the list above, a disconnected mailbox is unreadable even if still ticked, and nothing is sent without your approval. No setting can guarantee how an assistant interprets text inside an email, which is why drafts are for you to review. AI-assisted sends are planned to count toward the same daily limit as your own; the counting rule is still to be confirmed and this preview enforces nothing. Try the preview in{' '}
        <Link to="/assistant" className="font-medium text-accent-text underline underline-offset-2">
          AI Assistant
        </Link>
        .
      </Callout>
    </div>
  )
}
