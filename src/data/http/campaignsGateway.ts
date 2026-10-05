import { z } from 'zod'
import { createdIntent } from '../../../backend/contracts/v1'
import type { HttpClient } from './httpClient'

// AIDEV-NOTE: Campaign state changes never approve a send; review uses the existing immutable send-request screen.
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u)
const campaign = z.object({ id, status: z.enum(['draft', 'running', 'paused']) }).strict()
const page = z.object({ items: z.array(campaign).max(100), next: id.nullable(), simulated: z.boolean() }).strict()
const draft = z.object({ mailboxId: id, recipient: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  subject: z.string().trim().min(1).max(998).refine(value => !/[\r\n]/u.test(value)), body: z.string().min(1).max(100_000),
  scheduledAt: z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString()).optional() }).strict()
export type CampaignPage = z.infer<typeof page>
export function createCampaignsGateway(http: HttpClient) {
  return {
    list(after: string | null = null) {
      return http.request('GET', `/v1/campaigns?limit=25${after ? `&after=${encodeURIComponent(id.parse(after))}` : ''}`, page)
    },
    create(value: string) { return http.request('POST', '/v1/campaigns', campaign, { id: id.parse(value) }) },
    status(value: string, status: 'running' | 'paused') {
      return http.request('PATCH', `/v1/campaigns/${id.parse(value)}`, z.object({ status: z.enum(['running', 'paused']) }).strict(), { status })
    },
    prepare(value: string, input: unknown) {
      return http.request('POST', `/v1/campaigns/${id.parse(value)}/drafts`, createdIntent, draft.parse(input))
    },
  }
}
