import { z } from 'zod'
import { ApiError } from './core'
import { base64url, SecretBox } from './credentialVault'
import { HunterCredentials } from './hunterCredentials'
import { lookupHunter } from './hunterProvider'
import type { ProviderFetch } from './providers/http'

export type HunterRuntime = { vault: HunterCredentials; lookup: typeof lookupHunter }
// AIDEV-NOTE: Default-off configuration cannot make any paid enrichment requests.
export async function createHunterRuntime(db: D1Database, env: unknown, fetcher: ProviderFetch = fetch): Promise<HunterRuntime | undefined> {
  try {
    const flag = z.object({ HUNTER_ENABLED: z.enum(['true', 'false']).optional() }).parse(env)
    if (flag.HUNTER_ENABLED !== 'true') return undefined
    const { HUNTER_ENCRYPTION_KEY: encoded } = z.object({ HUNTER_ENCRYPTION_KEY: z.string().regex(/^[A-Za-z0-9_-]{43}$/u) }).parse(env)
    const raw = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))
    if (raw.length !== 32 || base64url(raw) !== encoded) throw new Error('key')
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
    return { vault: new HunterCredentials(db, new SecretBox('hunter', new Map([['hunter', key]]))),
      lookup: (email, apiKey) => lookupHunter(email, apiKey, fetcher) }
  } catch { throw new ApiError('hunter_configuration_invalid', 503) }
}
