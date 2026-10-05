import { z } from 'zod'
import { status } from '../../../backend/contracts/v1'
import type { HttpClient } from './httpClient'

// AIDEV-NOTE: Sequence records contain review links, never approval authority or provider-generated content.
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u)
const step = z.object({ subject: z.string().trim().min(1).max(998).refine(value => !/[\r\n]/u.test(value)),
  body: z.string().min(1).max(100_000), scheduledAt: z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString()) }).strict()
export const sequenceInput = z.object({ mailboxId: id, recipient: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  steps: z.array(step).min(1).max(3) }).strict().refine(value => value.steps.every((item, index) =>
    index === 0 || Date.parse(item.scheduledAt) > Date.parse(value.steps[index - 1]!.scheduledAt)), 'Send times must increase.')
const sequence = z.object({ id, mailboxId: id, recipient: z.email().max(254), steps: z.array(z.object({ id,
  revision: z.string().regex(/^[a-f0-9]{64}$/u), status, scheduledAt: z.number().int().nonnegative() }).strict()).min(1).max(3) }).strict()
const result = z.object({ sequence, liveActivationAvailable: z.boolean() }).strict()
const page = z.object({ items: z.array(sequence).max(25), next: id.nullable(), liveActivationAvailable: z.boolean() }).strict()
export type Sequence = z.infer<typeof sequence>
export type SequencePage = z.infer<typeof page>
export function createSequencesGateway(http: HttpClient) {
  const path = (campaignId: string) => `/v1/campaigns/${id.parse(campaignId)}/sequences`
  return {
    list(campaignId: string, after: string | null = null) {
      return http.request('GET', `${path(campaignId)}?limit=25${after ? `&after=${id.parse(after)}` : ''}`, page)
    },
    create(campaignId: string, input: unknown, idempotencyKey: string) {
      const body = { ...sequenceInput.parse(input), idempotencyKey: id.parse(idempotencyKey) }
      // AIDEV-NOTE: The aggregate UTF-8 envelope shares backend/core's 128 KiB request cap.
      if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 131_072) throw new Error('Shorten the messages: the sequence exceeds the 128 KiB request limit.')
      return http.request('POST', path(campaignId), result, body)
    },
    cancel(campaignId: string, sequenceId: string) {
      return http.request('POST', `${path(campaignId)}/${id.parse(sequenceId)}/cancel`, result, {})
    },
  }
}
