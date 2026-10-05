import { z } from 'zod'

// AIDEV-NOTE: DNS is manual-only; exact approved previews cannot authorise any runtime DNS executor.
const protectedRoots = ['elevateoco.com', 'boltloop.co', 'flooda.co']
export function canonicalDnsName(raw: string): string {
  const name = raw.toLowerCase().replace(/\.$/u, '')
  if (name.length > 253 || !name.split('.').every(label =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))) throw new Error('DNS_NAME_INVALID')
  return name
}
function canonicalRecordName(raw: string): string {
  const name = raw.toLowerCase().replace(/\.$/u, '')
  if (name.length > 253 || !name.split('.').every(label =>
    /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/u.test(label))) throw new Error('DNS_NAME_INVALID')
  return name
}
const changeSchema = z.object({
  name: z.string().transform(canonicalRecordName),
  type: z.enum(['TXT', 'CNAME', 'MX']),
  value: z.string().min(1).max(2048).refine(value => !/[\r\n]/u.test(value) && !value.includes(String.fromCharCode(0))),
  ttl: z.number().int().min(60).max(86_400),
  previousValue: z.string().max(2048).nullable(),
}).strict()
export type DnsChange = z.infer<typeof changeSchema>
export interface DnsApproval {
  ownerId: string
  approvedSubdomain: string
  exactChanges: DnsChange[]
}

export function validateDnsPlan(ownerId: string, changes: unknown, approval: DnsApproval): DnsChange[] {
  const parsed = z.array(changeSchema).min(1).max(20).parse(changes)
  const approved = z.array(changeSchema).min(1).max(20).parse(approval.exactChanges)
  const scope = canonicalDnsName(approval.approvedSubdomain)
  if (approval.ownerId !== ownerId || !protectedRoots.some(root => scope.endsWith(`.${root}`)) ||
    scope === 'in.elevateoco.com' || scope.endsWith('.in.elevateoco.com')) throw new Error('DNS_SCOPE_DENIED')
  const fingerprint = (change: DnsChange): string => JSON.stringify([
    change.name, change.type, change.value, change.ttl, change.previousValue,
  ])
  const seen = new Set<string>()
  for (const change of parsed) {
    const key = `${change.name}:${change.type}`
    if (seen.has(key) || !(change.name === scope || change.name.endsWith(`.${scope}`)) ||
      !approved.some(item => fingerprint(item) === fingerprint(change))) {
      throw new Error('DNS_PLAN_NOT_APPROVED')
    }
    seen.add(key)
  }
  if (parsed.length !== approved.length) throw new Error('DNS_PLAN_NOT_APPROVED')
  return parsed
}
