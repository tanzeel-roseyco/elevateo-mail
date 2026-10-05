import { z } from 'zod'

// AIDEV-NOTE: Admission validates completed drafts; partial frontend draft addresses remain frontend-only.
const identifier = z.string().trim().regex(/^[a-zA-Z0-9_-]{1,128}$/u)
const address = z.string().trim().toLowerCase().pipe(z.email().max(254))
const recipients = z.array(address).max(30).default([])

export const sendInputSchema = z.object({
  mailboxId: identifier,
  to: recipients,
  cc: recipients,
  bcc: recipients,
  subject: z.string().trim().min(1).max(998).refine(value => !/[\r\n]/u.test(value), 'Header newline forbidden'),
  body: z.string().min(1).max(100_000),
  kind: z.enum(['manual', 'campaign', 'ai']),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  idempotencyKey: identifier,
  campaignId: identifier.optional(),
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
}).strict().superRefine((input, context) => {
  const count = new Set([...input.to, ...input.cc, ...input.bcc]).size
  if ((input.kind === 'campaign') !== (input.campaignId !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Campaign sends require a campaign ID exclusively' })
  }
  if (input.to.length === 0) context.addIssue({ code: 'custom', path: ['to'], message: 'At least one To address required' })
  if (count > 30) context.addIssue({ code: 'custom', message: 'Maximum 30 unique recipients' })
}).transform(input => {
  const seen = new Set<string>()
  const unique = (values: string[]): string[] => values.filter(value => {
    if (seen.has(value)) return false
    seen.add(value)
    return true
  })
  return { ...input, to: unique(input.to), cc: unique(input.cc), bcc: unique(input.bcc) }
})

export type SendInput = z.infer<typeof sendInputSchema>
export const recipientCount = (input: Pick<SendInput, 'to' | 'cc' | 'bcc'>): number =>
  new Set([...input.to, ...input.cc, ...input.bcc]).size
