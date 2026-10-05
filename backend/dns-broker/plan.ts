import { z } from 'zod';
// AIDEV-NOTE: Read-only plans are review artifacts, never authority to execute DNS changes.
const id = z.string().regex(/^[a-f0-9]{32}$/);
const name = z.string().max(253).transform((s) => s.toLowerCase().replace(/\.$/, '')).refine((s) =>
  s.split('.').every((label) => /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/.test(label)));
const hostname = name.refine((s) => !s.includes('_'));
export const grantSchema = z.object({ owner: z.string().min(1).max(128), zoneId: id, zoneName: hostname,
  subdomain: hostname, names: z.array(name).min(1).max(20) }).strict();
export const recordSchema = z.object({ id, name, type: z.enum(['TXT', 'CNAME', 'MX']),
  content: z.string().min(1).max(2048).refine((s) => !/[\r\n\0]/.test(s)),
  ttl: z.number().int().refine((n) => n === 1 || (n >= 60 && n <= 86400)),
  priority: z.number().int().min(0).max(65535).optional(), proxied: z.literal(false),
}).strict().superRefine((r, ctx) => {
  if ((r.type === 'MX') !== (r.priority !== undefined)) ctx.addIssue({ code: 'custom', message: 'MX priority required exclusively' });
  if (r.type !== 'TXT' && !hostname.safeParse(r.content).success) ctx.addIssue({ code: 'custom', message: 'Invalid target hostname' });
});
export type DnsRecord = z.infer<typeof recordSchema>;
export type DnsGrant = z.infer<typeof grantSchema>;
const below = (value: string, scope: string) => value.endsWith(`.${scope}`);
export function authorizeName(owner: string, rawGrant: unknown, rawName: unknown): DnsGrant {
  const grant = grantSchema.parse(rawGrant); const recordName = name.parse(rawName);
  if (owner !== grant.owner || !below(grant.subdomain, grant.zoneName)
    || !(recordName === grant.subdomain || below(recordName, grant.subdomain))
    || !grant.names.includes(recordName)
    || ['elevateoco.com', 'boltloop.co', 'flooda.co'].includes(recordName)
    || recordName === 'in.elevateoco.com' || below(recordName, 'in.elevateoco.com')) throw new Error('dns_scope_denied');
  return grant;
}
export function fingerprint(record: DnsRecord): string {
  return JSON.stringify([record.id, record.name, record.type, record.content, record.ttl, record.priority ?? null, record.proxied]);
}
export async function createDnsPlan(owner: string, rawGrant: unknown, baseline: unknown, proposed: unknown, now: number) {
  const before = recordSchema.parse(baseline); const after = recordSchema.parse(proposed);
  const grant = authorizeName(owner, rawGrant, before.name);
  if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000 - 300_000
    || before.id !== after.id || before.name !== after.name || before.type !== after.type) throw new Error('dns_plan_invalid');
  const payload = JSON.stringify({ owner, zoneId: grant.zoneId, before: fingerprint(before), after: fingerprint(after), expiresAt: now + 300_000 });
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))), (b) => b.toString(16).padStart(2, '0')).join('');
  return Object.freeze({ mode: 'read_only' as const, payload, hash });
}
