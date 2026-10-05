import { z } from 'zod'
import { ApiError } from './core'
import { base64url, SecretBox } from './credentialVault'
import { ResendCredentials } from './resendCredentials'
import { ResendDomainTransport } from './providers/resendDomain'
import type { ResendDomainVerifier } from './resendAdmission'
import type { ProviderFetch } from './providers/http'

export interface ResendRuntime { vault: ResendCredentials; verifier: ResendDomainVerifier }
// AIDEV-NOTE: Enables credential management/domain reads only; no send transport or DNS capability is constructed.
export async function createResendRuntime(db: D1Database, env: unknown, fetcher: ProviderFetch = fetch): Promise<ResendRuntime | undefined> {
  try {
    const flag = z.object({ RESEND_CONNECTIONS_ENABLED: z.enum(['true', 'false']).optional() }).parse(env)
    if (flag.RESEND_CONNECTIONS_ENABLED !== 'true') return undefined
    const { RESEND_ENCRYPTION_KEY: encoded } = z.object({ RESEND_ENCRYPTION_KEY: z.string().regex(/^[A-Za-z0-9_-]{43}$/u) }).parse(env)
    const raw = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))
    if (raw.length !== 32 || base64url(raw) !== encoded) throw new Error('key')
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
    return { vault: new ResendCredentials(db, new SecretBox('resend', new Map([['resend', key]]))),
      verifier: new ResendDomainTransport(fetcher) }
  } catch { throw new ApiError('resend_configuration_invalid', 503) }
}
