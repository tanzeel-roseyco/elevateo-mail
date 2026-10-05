import { replyEnvelopeSchema } from '../gmailReply'
import { z } from 'zod';

// AIDEV-NOTE: Provider acceptance is not delivery; unknown outcomes retain quota and require reconciliation.
const address = z.string().email().max(254).regex(/^[^\r\n]+$/);
export const envelopeSchema = z.object({
  resendReplyTo: address.optional(),
  resendReplyChannelHash: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  reply: replyEnvelopeSchema.optional(),
  id: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  owner: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/), mailboxId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  from: address, to: z.array(address).max(30), cc: z.array(address).max(30), bcc: z.array(address).max(30),
  subject: z.string().min(1).max(998).regex(/^[^\r\n]*$/), body: z.string().min(1).max(100_000),
  kind: z.enum(['manual', 'campaign', 'ai']), revision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().refine(e => e.to.length + e.cc.length + e.bcc.length > 0 && e.to.length + e.cc.length + e.bcc.length <= 30);
export type SendEnvelope = z.infer<typeof envelopeSchema>;
export type SendOutcome = { status: 'accepted'; providerId: string } | { status: 'rejected'; code: string } | { status: 'unknown' };
export interface SendProvider {
  send(envelope: SendEnvelope): Promise<SendOutcome>;
  reconcile(envelope: SendEnvelope): Promise<SendOutcome>;
}
export const providerCapabilities = {
  gmail: { inbox: true, send: true, idempotency: false },
  resend: { inbox: false, send: true, idempotency: true },
  fake: { inbox: false, send: true, idempotency: true },
} as const;
