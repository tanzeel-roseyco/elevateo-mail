import { DOMAIN_NAMES, type DomainInfo, type DomainName, type Identity, type Settings } from './schema'

// AIDEV-NOTE: The nine sender identities are fixed product data: 3 local parts × 3 domains, one unified inbox.
export const LOCAL_PARTS = ['lachlan.macdonald', 'lachlan', 'l.macdonald'] as const

export const DEFAULT_UNSUBSCRIBE_FOOTER =
  'You are receiving this because you opted in to hear from us. If you would rather not, you can unsubscribe at any time.'

export function defaultDomains(): DomainInfo[] {
  return [
    { domain: 'boltloop.co', brand: 'Boltloop', bannerText: 'Boltloop — automation that ships', spf: 'verified', dkim: 'verified', dmarc: 'verified' },
    // One pending record so the "domain configuration issue" alert has something real to show.
    { domain: 'flooda.co', brand: 'Flooda', bannerText: 'Flooda — flood-risk intelligence', spf: 'verified', dkim: 'pending', dmarc: 'verified' },
    { domain: 'elevateoco.com', brand: 'Elevateo', bannerText: 'Elevateo — leadership, elevated', spf: 'verified', dkim: 'verified', dmarc: 'verified' },
  ]
}

export function brandOf(domain: DomainName): string {
  return defaultDomains().find((d) => d.domain === domain)?.brand ?? domain
}

export function defaultIdentities(): Identity[] {
  return DOMAIN_NAMES.flatMap((domain) =>
    LOCAL_PARTS.map((local) => ({
      id: `${local}@${domain}`,
      local,
      domain,
      displayName: 'Lachlan Macdonald',
      signature: `Lachlan Macdonald\n${brandOf(domain)}\n${local}@${domain}`,
      // Banners are opt-in per identity; a brand's banner is never applied to another brand's mail.
      banner: false,
    })),
  )
}

export function defaultSettings(nowIso: string): Settings {
  return {
    defaultIdentityId: 'lachlan@boltloop.co',
    timezone: 'Europe/London',
    windowStart: '09:00',
    windowEnd: '17:00',
    dailyLimitPerIdentity: 40,
    unsubscribeFooter: DEFAULT_UNSUBSCRIBE_FOOTER,
    notifications: { replies: true, failures: true, completion: true },
    notificationsSeenAt: nowIso,
    profile: { name: 'Lachlan Macdonald', email: 'lachlan@boltloop.co' },
  }
}

/** Identity ids are full addresses, so the domain can be read without a lookup. */
export function identityDomain(identityId: string): DomainName | null {
  const parts = identityId.split('@')
  // Exactly one "@": "x@boltloop.co@evil.example" must not be read as a boltloop.co address.
  if (parts.length !== 2) return null
  return DOMAIN_NAMES.find((d) => d === parts[1]) ?? null
}

export function isOwnAddress(email: string, identities: Identity[]): boolean {
  const lower = email.toLowerCase()
  return identities.some((i) => i.id === lower)
}
