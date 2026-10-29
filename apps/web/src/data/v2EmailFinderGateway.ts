import { z } from 'zod'
import { requestJson, type FetchLike } from './http/transport'
import { CollaborationErrorSchema } from './contract'
import type { CsrfProof, ReadContext } from './gateway'
import { FinderHealthSchema, FinderJobSchema, FinderRequestSchema, FinderSuppressionSchema,
  SuppressionInputSchema, type EmailFinderGateway } from '@/features/email-finder/contract'

// AIDEV-NOTE: All transport shares the app session, CSRF protection and bounded JSON/error validation.
export function createV2EmailFinderGateway(fetchImpl?: FetchLike): EmailFinderGateway {
  const base = fetchImpl === undefined ? { errorSchema: CollaborationErrorSchema } : { fetchImpl, errorSchema: CollaborationErrorSchema }
  const headers = (ctx: ReadContext, proof?: CsrfProof) => ({
    'X-Session-Context': ctx.contextId, 'X-Authorization-Version': ctx.authorizationVersion,
    ...(proof === undefined ? {} : { 'X-CSRF-Token': proof.csrfToken }),
  })
  const path = (id: string) => `/v2/email-finder/jobs/${z.uuid().parse(id)}`
  return {
    jobs: (ctx, signal) => requestJson('/v2/email-finder/jobs', z.strictObject({ items: z.array(FinderJobSchema).max(100) }),
      1_048_576, { ...base, headers: headers(ctx), signal }),
    job: (id, ctx, signal) => requestJson(path(id), FinderJobSchema, 16_777_216, { ...base, headers: headers(ctx), signal }),
    create: (input, ctx, proof, signal) => requestJson('/v2/email-finder/jobs', FinderJobSchema, 16_777_216,
      { ...base, method: 'POST', body: FinderRequestSchema.parse(input), maxRequestBytes: 16_777_216, headers: headers(ctx, proof), signal }),
    export: (id, ctx, signal) => requestJson(`${path(id)}/export`, z.strictObject({ csv: z.string() }),
      16_777_216, { ...base, headers: headers(ctx), signal }),
    health: (ctx, signal) => requestJson('/v2/email-finder/health', FinderHealthSchema, 8_192, { ...base, headers: headers(ctx), signal }),
    suppressions: (ctx, signal) => requestJson('/v2/email-finder/suppressions',
      z.strictObject({ items: z.array(FinderSuppressionSchema).max(10_000) }), 4_194_304, { ...base, headers: headers(ctx), signal }),
    suppress: (input, ctx, proof, signal) => requestJson('/v2/email-finder/suppressions', FinderSuppressionSchema, 4_096,
      { ...base, method: 'POST', body: SuppressionInputSchema.parse(input), headers: headers(ctx, proof), signal }),
    unsuppress: (id, ctx, proof, signal) => requestJson(`/v2/email-finder/suppressions/${z.uuid().parse(id)}`,
      z.strictObject({ deleted: z.literal(true) }), 4_096,
      { ...base, method: 'DELETE', headers: headers(ctx, proof), signal }),
  }
}
