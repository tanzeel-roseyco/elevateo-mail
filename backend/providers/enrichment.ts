import { z } from 'zod'
import { idSchema } from '../core'

// AIDEV-NOTE: Enrichment never grants consent or sending; unidentified AMF and unverified Hunter contracts stay disabled.
export const enrichmentRequestSchema = z.object({ ownerId: idSchema,
  emails: z.array(z.email().max(254)).min(1).max(100) }).strict()
export type EnrichmentRequest = z.infer<typeof enrichmentRequestSchema>
export type EnrichmentResult = { status: 'disabled'; contacts: [] }
export interface EnrichmentProvider { enrich(request: EnrichmentRequest): Promise<EnrichmentResult> }
export class DisabledEnrichmentProvider implements EnrichmentProvider {
  async enrich(request: EnrichmentRequest): Promise<EnrichmentResult> {
    enrichmentRequestSchema.parse(request)
    return { status: 'disabled', contacts: [] }
  }
}
