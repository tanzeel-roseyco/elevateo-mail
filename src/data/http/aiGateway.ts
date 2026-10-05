import { z } from 'zod'
import { createdIntent, id } from '../../../backend/contracts/v1'
import { sendInputSchema } from '../../../backend/policies/send'
import { sendContentSchema, type SendContent } from '@/domain/sendLifecycle'
import type { HttpClient } from './httpClient'

// AIDEV-NOTE: This seam retrieves data and saves drafts; it neither runs an AI nor grants approval/send tools.
const selection = z.object({ mailboxId: id, messageIds: z.array(id).min(1).max(20) }).strict()
const contextResponse = z.object({
  mailboxId: id,
  context: z.object({ trust: z.literal('untrusted-email'), content: z.string().max(100_000) }).strict(),
  tools: z.array(z.enum(['read', 'draft'])).min(1).max(2),
  simulated: z.boolean(),
}).strict()
export type AiMailContext = z.infer<typeof contextResponse>

export function createAiGateway(http: HttpClient) {
  return {
    context(mailboxId: string, messageIds: string[]) {
      const input = selection.parse({ mailboxId, messageIds })
      return http.request('POST', '/v1/ai/context', contextResponse.refine(value => value.mailboxId === input.mailboxId), input)
    },
    saveDraft(key: string, content: SendContent) {
      // AIDEV-NOTE: The caller persists the key before submission; uncertain outcomes reuse it, never a fresh key.
      const draft = sendInputSchema.parse({ ...sendContentSchema.strict().parse(content), kind: 'ai', revision: 1, idempotencyKey: id.parse(key) })
      return http.request('POST', '/v1/ai/drafts', createdIntent, { mailboxId: draft.mailboxId, draft })
    },
  }
}
