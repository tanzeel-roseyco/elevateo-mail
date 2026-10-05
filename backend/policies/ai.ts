import { z } from 'zod'
import { idSchema } from '../core'

// AIDEV-NOTE: Mail is data, never authority; this module grants no processes, filesystem access or CLI tools.
export const aiGrantSchema = z.object({
  ownerId: idSchema,
  mailboxIds: z.array(idSchema).min(1).max(10),
  tools: z.array(z.enum(['read', 'draft'])).max(2),
  expiresAt: z.number().int().positive(),
}).strict()
export type AiGrant = z.infer<typeof aiGrantSchema>
const aiSendRequestSchema = z.object({ ownerId: idSchema, mailboxId: idSchema, intentId: idSchema,
  revision: z.string().regex(/^[a-f0-9]{64}$/u) }).strict()
const aiSendApprovalSchema = aiSendRequestSchema.extend({ expiresAt: z.number().int().positive() }).strict()
export type AiSendApproval = z.infer<typeof aiSendApprovalSchema>

export function authorizeAiTool(grant: AiGrant, ownerId: string, mailboxId: string, tool: 'read' | 'draft', now: number): void {
  aiGrantSchema.parse(grant)
  if (!Number.isFinite(now) || grant.ownerId !== ownerId || grant.expiresAt <= now ||
    !grant.mailboxIds.includes(mailboxId) || !grant.tools.includes(tool)) throw new Error('AI_SCOPE_DENIED')
}

export function authorizeAiSend(approval: AiSendApproval, request: Omit<AiSendApproval, 'expiresAt'>,
  separatelyEnabled: boolean, now: number): void {
  aiSendApprovalSchema.parse(approval)
  aiSendRequestSchema.parse(request)
  if (!Number.isFinite(now) || !Number.isFinite(approval.expiresAt) || !/^[a-f0-9]{64}$/u.test(request.revision) ||
    !separatelyEnabled || approval.expiresAt <= now ||
    approval.ownerId !== request.ownerId || approval.mailboxId !== request.mailboxId ||
    approval.intentId !== request.intentId || approval.revision !== request.revision) throw new Error('AI_SEND_DENIED')
}

export function untrustedMailContext(text: string): { trust: 'untrusted-email'; content: string } {
  return { trust: 'untrusted-email', content: z.string().max(100_000).parse(text) }
}
