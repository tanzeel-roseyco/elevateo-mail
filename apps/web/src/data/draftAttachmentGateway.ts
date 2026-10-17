import { z } from 'zod'
import type { CsrfProof, ReadContext } from './gateway'
import { CollaborationErrorSchema } from './contract'
import { GatewayError } from './errors'
import { requestJson, type FetchLike } from './http/transport'

const id = z.uuid()
export const DraftAttachmentSchema = z.strictObject({
  id, filename: z.string().min(1).max(255),
  content_type: z.enum(['application/pdf', 'image/png', 'image/jpeg', 'text/plain']),
  byte_size: z.number().int().min(1).max(1_048_576),
  status: z.enum(['pending_scan', 'clean', 'malware', 'scan_failed']),
})
export type DraftAttachment = z.infer<typeof DraftAttachmentSchema>
export interface DraftUpload {
  operation_id: string
  mailbox_id: string
  filename: string
  content_type: DraftAttachment['content_type']
  content_base64: string
}
const page = z.strictObject({ items: z.array(DraftAttachmentSchema).max(1) })
const headers = (ctx: ReadContext, proof?: CsrfProof): Record<string, string> => ({
  'X-Session-Context': ctx.contextId, 'X-Authorization-Version': ctx.authorizationVersion,
  ...(proof ? { 'X-CSRF-Token': proof.csrfToken } : {}),
})
const path = (draftId: string) => `/v1/drafts/${encodeURIComponent(id.parse(draftId))}/attachments`

// AIDEV-NOTE: Upload retries retain this exact operation and bytes; the server reconciles immutable reservations.
export function createDraftAttachmentGateway(fetchImpl?: FetchLike) {
  const transport = { ...(fetchImpl ? { fetchImpl } : {}), errorSchema: CollaborationErrorSchema }
  return {
    list(ctx: ReadContext, draftId: string, mailboxId: string, signal: AbortSignal) {
      return requestJson(`${path(draftId)}?mailbox_id=${id.parse(mailboxId)}`, page, 4096,
        { ...transport, headers: headers(ctx), signal })
    },
    upload(ctx: ReadContext, proof: CsrfProof, draftId: string, input: DraftUpload, signal: AbortSignal) {
      return requestJson(path(draftId), DraftAttachmentSchema, 4096,
        { ...transport, headers: headers(ctx, proof), signal, body: input, maxRequestBytes: 1_400_000 })
    },
    remove(ctx: ReadContext, proof: CsrfProof, draftId: string, mailboxId: string, attachmentId: string, signal: AbortSignal) {
      return requestJson(`${path(draftId)}/${id.parse(attachmentId)}?mailbox_id=${id.parse(mailboxId)}`,
        z.strictObject({ removed: z.literal(true) }), 1024,
        { ...transport, headers: headers(ctx, proof), signal, method: 'DELETE' })
    },
  }
}
export type DraftAttachmentGateway = ReturnType<typeof createDraftAttachmentGateway>

export async function prepareDraftUpload(file: File, mailboxId: string, operationId: string): Promise<DraftUpload> {
  const mime = DraftAttachmentSchema.shape.content_type.safeParse(file.type)
  if (!mime.success || file.size < 1 || file.size > 1_048_576 || file.name.length === 0 ||
    new TextEncoder().encode(file.name).length > 255 || file.name.trim() !== file.name ||
    file.name === '.' || file.name === '..' || /[/\\]/.test(file.name) ||
    Array.from(file.name).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new GatewayError('transport', 'malformed', 'Choose a PDF, PNG, JPEG or text file between 1 byte and 1 MiB.')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length !== file.size) throw new GatewayError('transport', 'malformed', 'The file changed while reading.')
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return { operation_id: id.parse(operationId), mailbox_id: id.parse(mailboxId), filename: file.name,
    content_type: mime.data, content_base64: btoa(binary) }
}
