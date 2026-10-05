import { z } from 'zod'
import { ApiError } from './core'
import { providerRequest, type ProviderFetch } from './providers/http'

const text = z.string().max(512).nullable().optional()
const profile = z.object({ name: z.object({ fullName: text }).nullish(), location: text,
  employment: z.object({ name: text, domain: text, title: text }).nullish() })
// AIDEV-NOTE: Only explicit lookups spend credits; never retry or retain Hunter's entire personal-data response.
export async function lookupHunter(email: string, apiKey: string, fetcher: ProviderFetch = fetch) {
  const result = await providerRequest(fetcher, `https://api.hunter.io/v2/people/find?email=${encodeURIComponent(email)}`,
    { method: 'GET', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } })
  if (result?.status === 404) return null
  if (result?.status === 451) throw new ApiError('enrichment_restricted', 409)
  if (result?.status === 401 || result?.status === 403) throw new ApiError('enrichment_key_rejected', 409)
  if (result?.status === 429) throw new ApiError('enrichment_rate_limited', 429)
  if (result?.status !== 200) throw new ApiError('enrichment_unavailable', 502)
  const parsed = z.object({ data: profile }).safeParse(result.body)
  if (!parsed.success) throw new ApiError('enrichment_unavailable', 502)
  const data = parsed.data.data
  return { fullName: data.name?.fullName ?? null, title: data.employment?.title ?? null,
    company: data.employment?.name ?? null, companyDomain: data.employment?.domain ?? null,
    location: data.location ?? null }
}
