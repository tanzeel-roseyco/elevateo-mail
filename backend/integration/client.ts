import { z } from 'zod'
import { approvalInput, capabilitiesResponse, createdIntent, errorResponse, id, intentResponse, mailboxPage,
  manualSendInput, messageDetail, messagePage, permissionsInput, quotaResponse, savedResponse, updatedResponse } from '../contracts/v1'

// AIDEV-NOTE: This browser-compatible consumer owns no quota or send rules; Fable can adapt DTOs behind its gateway.
export class IntegrationError extends Error {
  constructor(readonly code: string, readonly status: number, readonly requestId: string) { super(code) }
}
export class MailHttpClient {
  constructor(private readonly baseUrl: string, private readonly bearer: string,
    private readonly transport: typeof fetch = fetch) {}
  private async call<T>(path: string, schema: z.ZodType<T>, method = 'GET', body?: unknown): Promise<T> {
    const response = await this.transport(new URL(path, this.baseUrl), { method,
      headers: { authorization: `Bearer ${this.bearer}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const data: unknown = await response.json()
    if (!response.ok) {
      const { error } = errorResponse.parse(data)
      throw new IntegrationError(error.code, response.status, error.requestId)
    }
    return schema.parse(data)
  }
  capabilities() { return this.call('/v1/capabilities', capabilitiesResponse) }
  mailboxes(after?: string) { return this.call(`/v1/mailboxes${after ? `?after=${id.parse(after)}` : ''}`, mailboxPage) }
  quota(mailboxId: string) { return this.call(`/v1/mailboxes/${id.parse(mailboxId)}/quota`, quotaResponse) }
  messages(mailboxId: string, cursor?: { before: number; beforeId: string }, limit = 50) {
    const query = new URLSearchParams({ mailboxId: id.parse(mailboxId), limit: String(limit),
      ...(cursor ? { before: String(cursor.before), beforeId: id.parse(cursor.beforeId) } : {}) })
    return this.call(`/v1/messages?${query}`, messagePage)
  }
  body(mailboxId: string, messageId: string) {
    return this.call(`/v1/messages/${id.parse(mailboxId)}/${id.parse(messageId)}`, messageDetail)
  }
  create(input: unknown) { return this.call('/v1/send-intents', createdIntent, 'POST', manualSendInput.parse(input)) }
  approve(intentId: string, revision: string) {
    return this.call(`/v1/send-intents/${id.parse(intentId)}/approve`, savedResponse, 'POST', approvalInput.parse({ revision }))
  }
  inspect(intentId: string) { return this.call(`/v1/send-intents/${id.parse(intentId)}`, intentResponse) }
  cancel(intentId: string) { return this.call(`/v1/send-intents/${id.parse(intentId)}/cancel`, savedResponse, 'POST') }
  permissions(mailboxId: string, input: unknown) {
    return this.call(`/v1/mailboxes/${id.parse(mailboxId)}/permissions`, updatedResponse, 'PATCH', permissionsInput.parse(input))
  }
}
