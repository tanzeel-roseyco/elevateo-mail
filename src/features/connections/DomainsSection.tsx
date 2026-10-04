import { Globe, Info, Lock } from 'lucide-react'
import { useData } from '@/data/store'
import { sendingDomains } from '@/domain/connections'
import { Badge, StatusBadge } from '@/ui/Badge'
import { Callout, DomainDot, EmptyState } from '@/ui/Bits'

// AIDEV-NOTE: Read-only DNS view. Root MX is never changed by this product; subdomain records stay manual until approved.
export function DomainsSection() {
  const domains = useData((s) => s.domains)
  const resend = useData((s) => s.connections.resendIdentities)
  const subdomains = sendingDomains(resend.map((r) => r.address), domains.map((d) => d.domain))

  return (
    <div className="mt-4 flex flex-col gap-6">
      <Callout tone="info" icon={Lock}>
        <p className="font-semibold">Your company mail routing is never changed</p>
        <p className="mt-0.5">The root mail (MX) records of these domains stay exactly as they are, so existing company inboxes keep working. Only separately approved sending subdomains can ever be managed, and for now every DNS change is made by hand after you have reviewed the exact records.</p>
      </Callout>

      <section aria-labelledby="cx-domains" className="flex flex-col gap-3">
        <h3 id="cx-domains" className="text-base font-semibold">
          Domains
        </h3>
        {domains.length === 0 ? (
          <EmptyState icon={Globe} title="No domains yet" body="Domains appear here once a mailbox on them is connected." />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {domains.map((d) => (
              <li key={d.domain} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <DomainDot domain={d.domain} />
                  <span className="text-sm font-semibold">{d.domain}</span>
                  <Badge tone="neutral" icon={Lock}>
                    Root MX protected
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge status={d.spf} prefix="SPF" />
                  <StatusBadge status={d.dkim} prefix="DKIM" />
                  <StatusBadge status={d.dmarc} prefix="DMARC" />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">Record status is demo data and has not been checked against live DNS.</p>
      </section>

      <section aria-labelledby="cx-subdomains" className="flex flex-col gap-3">
        <h3 id="cx-subdomains" className="text-base font-semibold">
          Sending domains
        </h3>
        {subdomains.length === 0 ? (
          <p className="text-[13px] text-muted">No sending domains. They are only needed if you use Resend for campaigns.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {subdomains.map((s) => (
              <li key={s.name} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <span className="text-sm font-semibold">{s.name}</span>
                {s.approvable ? <Badge tone="warn">Awaiting your approval</Badge> : <Badge tone="danger">Not a subdomain of your domains · cannot be managed</Badge>}
                <Badge tone="neutral">Manual DNS only</Badge>
              </li>
            ))}
          </ul>
        )}
        <Callout tone="info" icon={Info}>
          Nothing on this page can edit DNS. Automatic changes stay switched off until it is proven that the DNS access used can reach approved subdomains and nothing else.
        </Callout>
      </section>
    </div>
  )
}
