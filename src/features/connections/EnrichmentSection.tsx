import { Info, KeyRound } from 'lucide-react'
import { Badge } from '@/ui/Badge'
import { Callout } from '@/ui/Bits'

const PROVIDERS: Array<{ name: string; detail: string; open?: string }> = [
  { name: 'Hunter', detail: 'Looks up and checks work email addresses for contacts you already have a reason to write to.' },
  { name: 'AMF', detail: 'A second optional lookup source.', open: 'Which AMF product and API this refers to is still to be confirmed.' },
]

// AIDEV-NOTE: Deliberately has no key field: credentials are added last, server-side, never typed into this prototype.
export function EnrichmentSection() {
  return (
    <div className="mt-4 flex flex-col gap-5">
      <p className="text-[13px] text-muted">Optional services that fill in missing contact details. They only supply data: personalising what you write is planned as the AI assistant’s job, not theirs.</p>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {PROVIDERS.map((p) => (
          <li key={p.name} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{p.name}</span>
              <Badge tone="neutral" icon={KeyRound}>
                No key added
              </Badge>
            </div>
            <p className="text-[13px] text-muted">{p.detail}</p>
            {p.open && <p className="text-[13px] text-warn">{p.open}</p>}
          </li>
        ))}
      </ul>
      <Callout tone="info" icon={Info}>
        Each person will add their own key at the final setup stage. Keys will be stored on the server, never in this browser, and there is nowhere to enter one in this preview. Enrichment does not create consent: a found address still needs an opt-in record before any campaign can include it.
      </Callout>
    </div>
  )
}
