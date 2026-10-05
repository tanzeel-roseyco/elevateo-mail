import { z } from 'zod'
import { ApiError } from '../core'
import type { ResendDomainVerifier } from '../resendAdmission'
import { providerRequest, type ProviderFetch } from './http'

const domainId = z.string().uuid()
const key = z.string().min(1).max(8192).regex(/^[\x21-\x7e]+$/u)
const responseSchema = z.object({ id: domainId, name: z.string().min(1).max(253),
  status: z.string().max(64), capabilities: z.object({ sending: z.enum(['enabled', 'disabled']) }) })

// AIDEV-NOTE: Read-only provider evidence; this adapter never creates domains or changes DNS records.
export class ResendDomainTransport implements ResendDomainVerifier {
  constructor(private readonly fetcher: ProviderFetch = fetch) {}
  async verify(apiKey: string, id: string): Promise<unknown> {
    const parsedId = domainId.parse(id)
    const token = key.parse(apiKey)
    const response = await providerRequest(this.fetcher, `https://api.resend.com/domains/${parsedId}`, {
      method: 'GET', headers: { Authorization: `Bearer ${token}` },
    })
    // AIDEV-NOTE: Sending-only keys cannot prove domain ownership; failed reads grant no sender permission.
    if (!response || response.status !== 200) throw new ApiError('domain_verification_unavailable', 503)
    const parsed = responseSchema.safeParse(response.body)
    if (!parsed.success || parsed.data.id !== parsedId) throw new ApiError('domain_verification_unavailable', 503)
    return { id: parsed.data.id, name: parsed.data.name, status: parsed.data.status,
      sendingEnabled: parsed.data.capabilities.sending === 'enabled' }
  }
}
