import { z } from 'zod'
import { SERVER_SEND_STATUSES } from '@/domain/sendLifecycle'
import type { HttpClient } from './httpClient'

// AIDEV-NOTE: Health is owner-scoped operational counts, not delivery analytics or provider diagnostics.
export const healthResponse = z.object({
  sends: z.array(z.object({ status: z.enum(SERVER_SEND_STATUSES), count: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }))
    .max(SERVER_SEND_STATUSES.length).refine(rows => new Set(rows.map(row => row.status)).size === rows.length),
  simulated: z.boolean(), liveSending: z.boolean(), dnsWrites: z.boolean(), dispatchPaused: z.boolean(), integrationReady: z.boolean(),
  incompleteMessages: z.number().int().nonnegative().safe().default(0),
  backgroundJobs: z.array(z.object({ name: z.enum(['dispatch', 'inbox', 'cleanup']),
    status: z.enum(['not_started', 'failed', 'late', 'running', 'healthy']),
    lastSuccessAt: z.number().int().nonnegative().safe().nullable() })).max(3)
    .refine(rows => new Set(rows.map(row => row.name)).size === rows.length).optional(),
})
export type HealthSnapshot = z.infer<typeof healthResponse>
export function createHealthGateway(http: HttpClient) {
  return { read: (): Promise<HealthSnapshot> => http.request('GET', '/v1/health', healthResponse) }
}
