import { z } from 'zod'
import type { CsrfProof, ReadContext } from '@/data/gateway'

// AIDEV-NOTE: The worker owns discovery; this port only queues work and reads persisted, tenant-scoped results.
export const FinderKindSchema = z.enum(['person', 'verify', 'company', 'decision_maker'])
export type FinderKind = z.infer<typeof FinderKindSchema>
// AIDEV-NOTE: Input caps are UTF-8 bytes, matching the Ruby queue boundary rather than UTF-16 length.
const text = (max: number) => z.string().trim().min(1).refine((value) => new TextEncoder().encode(value).length <= max).refine(
  (value) => Array.from(value).every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127),
  'Control characters are not permitted.',
)
const domain = text(253).transform((value) => value.toLowerCase().replace(/\.$/, '')).refine(
  (value) => value.includes('.') && value.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)),
  'Enter a company domain without a scheme or path.',
)
export const FinderInputSchema = z.strictObject({
  name: text(200).optional(), company: text(250).optional(), domain: domain.optional(),
  email: z.email().max(254).optional(), role: text(200).optional(),
})
export const FinderRequestSchema = z.strictObject({
  kind: FinderKindSchema,
  rows: z.array(FinderInputSchema).min(1).max(5_000).nullable(),
  csv: z.string().min(1).refine((value) => new TextEncoder().encode(value).byteLength <= 2_097_152).nullable(),
}).superRefine((value, context) => {
  if ((value.rows === null) === (value.csv === null)) context.addIssue({ code: 'custom', message: 'Supply rows or CSV.' })
  if (value.csv !== null && value.kind === 'company') context.addIssue({ code: 'custom', message: 'Company search is a single lookup.' })
  if (value.kind === 'company' && value.rows !== null && value.rows.length !== 1) context.addIssue({ code: 'custom', message: 'Company search requires one row.' })
  value.rows?.forEach((row, index) => {
    const valid = value.kind === 'verify' ? Boolean(row.email) : Boolean(row.domain || row.company) &&
      (value.kind === 'person' ? Boolean(row.name) : value.kind === 'decision_maker' ? Boolean(row.role) : true)
    if (!valid) context.addIssue({ code: 'custom', path: ['rows', index], message: 'Required lookup fields are missing.' })
  })
})
const ResultBaseSchema = z.strictObject({
  status: z.enum(['valid', 'invalid', 'risky', 'unknown', 'sources_unavailable', 'suppressed']),
  email: z.email().max(254).optional(), confidence: z.number().int().min(0).max(100),
  reasons: z.array(z.string().max(2_000)).max(100), sources: z.array(z.string().max(2_048)).max(200),
  checked_at: z.iso.datetime(), name: z.string().max(200).optional(), title: z.string().max(200).optional(),
})
export const FinderResultSchema = ResultBaseSchema.extend({ emails: z.array(ResultBaseSchema).max(500).optional() })
export type FinderResult = z.infer<typeof FinderResultSchema>
export const FinderJobSchema = z.strictObject({
  id: z.uuid(), kind: FinderKindSchema, status: z.enum(['queued', 'running', 'completed', 'failed']),
  total: z.number().int().min(1).max(5_000), completed: z.number().int().min(0).max(5_000),
  created_at: z.iso.datetime(), items: z.array(z.strictObject({
    row: z.number().int().min(1).max(5_000), input: FinderInputSchema, result: FinderResultSchema.optional(),
  })).max(5_000),
}).superRefine((job, context) => {
  if (job.completed > job.total || job.items.some((item) => item.row > job.total) || new Set(job.items.map((item) => item.row)).size !== job.items.length) {
    context.addIssue({ code: 'custom', message: 'Job progress is inconsistent.' })
  }
})
export type FinderJob = z.infer<typeof FinderJobSchema>
export const FinderHealthSchema = z.strictObject({
  smtp_available: z.boolean(), smtp_reason: z.string().max(2_000), ehlo_hostname: z.string().nullable(),
  remaining_daily_probes: z.number().int().min(0).max(50), halted_until: z.iso.datetime().nullable(),
  worker_seen_at: z.iso.datetime().nullable(),
})
export type FinderHealth = z.infer<typeof FinderHealthSchema>
export const SuppressionInputSchema = z.strictObject({ kind: z.enum(['email', 'domain', 'person']), value: text(254) })
export const FinderSuppressionSchema = SuppressionInputSchema.extend({ id: z.uuid(), created_at: z.iso.datetime() })
export type FinderSuppression = z.infer<typeof FinderSuppressionSchema>

export interface EmailFinderGateway {
  jobs(ctx: ReadContext, signal: AbortSignal): Promise<{ items: FinderJob[] }>
  job(id: string, ctx: ReadContext, signal: AbortSignal): Promise<FinderJob>
  create(input: z.infer<typeof FinderRequestSchema>, ctx: ReadContext, proof: CsrfProof, signal: AbortSignal): Promise<FinderJob>
  export(id: string, ctx: ReadContext, signal: AbortSignal): Promise<{ csv: string }>
  health(ctx: ReadContext, signal: AbortSignal): Promise<FinderHealth>
  suppressions(ctx: ReadContext, signal: AbortSignal): Promise<{ items: FinderSuppression[] }>
  suppress(input: z.infer<typeof SuppressionInputSchema>, ctx: ReadContext, proof: CsrfProof, signal: AbortSignal): Promise<FinderSuppression>
  unsuppress(id: string, ctx: ReadContext, proof: CsrfProof, signal: AbortSignal): Promise<{ deleted: true }>
}
