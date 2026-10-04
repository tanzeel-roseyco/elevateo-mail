import { ArrowRight, CheckCircle2, FastForward, FileText, Pause, PenLine, Reply, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { lastMessage } from '@/domain/mail'
import { campaignMetrics } from '@/domain/rules'
import type { Campaign, Thread } from '@/domain/schema'
import { cx } from '@/lib/format'
import { threadHref } from '@/lib/routes'

interface Task {
  id: string
  icon: LucideIcon
  title: string
  detail: string
  to: string
}

const MAX_TASKS = 4

/**
 * The work queue, most urgent first: the longest-waiting reply, paused campaigns, running campaigns with recipients
 * pending, draft campaigns, then unfinished message drafts. The caller truncates, so this order decides what is hidden.
 * Problems (failures, DNS) are deliberately not here; they stay in the Alerts section above.
 */
function buildTasks(waiting: Thread[], campaigns: Campaign[], draftCount: number): Task[] {
  const tasks: Task[] = []

  // `waiting` is newest first; the person who has waited longest is answered first.
  const oldest = waiting[waiting.length - 1]
  if (oldest) {
    const others = waiting.length - 1
    tasks.push({
      id: 'reply',
      icon: Reply,
      title: `Reply to ${lastMessage(oldest).from.name}`,
      detail: `${oldest.subject}${others > 0 ? ` · ${others} more waiting` : ''}`,
      to: threadHref(oldest),
    })
  }
  // Collected per kind and then concatenated, so priority never depends on the order campaigns happen to be stored in:
  // a paused campaign must not be pushed past the cut-off by draft campaigns that precede it in the list.
  const paused: Task[] = []
  const running: Task[] = []
  const unfinished: Task[] = []
  for (const c of campaigns) {
    const { pending } = campaignMetrics(c)
    const to = `/campaigns/${c.id}`
    if (c.status === 'paused') paused.push({ id: c.id, icon: Pause, title: `Resume or review “${c.name}”`, detail: `Paused with ${pending} recipients remaining`, to })
    else if (c.status === 'running' && pending > 0) running.push({ id: c.id, icon: FastForward, title: `Simulate the next batch of “${c.name}”`, detail: `${pending} recipients pending · simulated sending`, to })
    else if (c.status === 'draft') unfinished.push({ id: c.id, icon: PenLine, title: `Finish setting up “${c.name}”`, detail: 'Draft campaign, not yet scheduled', to })
  }
  tasks.push(...paused, ...running, ...unfinished)
  if (draftCount > 0) {
    tasks.push({ id: 'drafts', icon: FileText, title: `Finish ${draftCount === 1 ? 'your draft' : `${draftCount} drafts`}`, detail: 'Saved automatically; nothing has been sent', to: '/mail/drafts' })
  }
  return tasks
}

// AIDEV-NOTE: Overview's "what do I do now" list. The first task is the primary action; the rest follow in priority order.
export function NextUp({ waiting, campaigns, draftCount }: { waiting: Thread[]; campaigns: Campaign[]; draftCount: number }) {
  const tasks = buildTasks(waiting, campaigns, draftCount)
  const shown = tasks.slice(0, MAX_TASKS)

  return (
    <section aria-labelledby="ov-next" className="overflow-hidden rounded-xl border border-line">
      <h2 id="ov-next" className="eyebrow border-b border-line bg-surface-2 px-4 py-2.5">
        Next up
      </h2>
      {shown.length === 0 ? (
        <p className="flex items-center gap-2.5 px-4 py-5 text-[13px]">
          <CheckCircle2 aria-hidden className="size-4 shrink-0 text-success" />
          Nothing needs you right now. No one is waiting on a reply and no campaign is stalled.
        </p>
      ) : (
        <ol>
          {shown.map((task, index) => (
            <li key={task.id} className="border-b border-line last:border-b-0">
              <Link to={task.to} className="group flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <span aria-hidden className={cx('flex size-8 shrink-0 items-center justify-center rounded-lg', index === 0 ? 'bg-fg text-surface' : 'bg-surface-2 text-fg')}>
                  <task.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx('block truncate', index === 0 ? 'text-[15px] font-semibold' : 'text-sm font-medium')}>{task.title}</span>
                  <span className="block truncate text-[13px] text-muted">{task.detail}</span>
                </span>
                <ArrowRight aria-hidden className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-fg" />
              </Link>
            </li>
          ))}
        </ol>
      )}
      {tasks.length > shown.length && <p className="border-t border-line px-4 py-2 text-xs text-muted">{tasks.length - shown.length} more below in campaigns and mail.</p>}
    </section>
  )
}
