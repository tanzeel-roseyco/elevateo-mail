import { z } from 'zod'
import type { FetchLike } from './http/transport'
import { requestJson } from './http/transport'
import { GatewayError } from './errors'
import type { CsrfProof, ReadContext } from './gateway'

// AIDEV-NOTE: PREF822 is a noncanonical proposal. This port is not injected into the production shell.
const displayName = z.string().refine((value) => {
  return Array.from(value).length >= 1 && Array.from(value).length <= 256 &&
    value.trim().length > 0 && !/[\x00-\x1f\x7f-\x9f]/.test(value)
}).nullable()
const revision = z.number().int().min(0).max(2_147_483_647)
export const UserDisplayPreferenceSchema = z.strictObject({ display_name: displayName, revision })
export const UserDisplayPreferencePageSchema = z.strictObject({
  context_id: z.string().min(16).max(256), authorization_version: z.string().min(16).max(256),
  display_name: displayName, revision,
})
export const UserDisplayPreferenceChangeSchema = z.strictObject({
  display_name: displayName, expected_revision: z.number().int().min(0).max(2_147_483_646),
})

const headers = (ctx: ReadContext, proof?: CsrfProof): Record<string, string> => ({
  'X-Session-Context': ctx.contextId,
  'X-Authorization-Version': ctx.authorizationVersion,
  ...(proof === undefined ? {} : { 'X-CSRF-Token': proof.csrfToken }),
})

export function createV2PreferencesGateway(fetchImpl?: FetchLike) {
  const base = fetchImpl === undefined ? {} : { fetchImpl }
  return {
    async getUserDisplayPreference(ctx: ReadContext, signal: AbortSignal) {
      const page = await requestJson('/v2/me/preferences', UserDisplayPreferencePageSchema, 4_096,
        { ...base, headers: headers(ctx), signal })
      if (page.context_id !== ctx.contextId || page.authorization_version !== ctx.authorizationVersion) {
        throw new GatewayError('transport', 'malformed', 'Preference context changed.')
      }
      return page
    },
    updateUserDisplayPreference(ctx: ReadContext, proof: CsrfProof, input: unknown, signal: AbortSignal) {
      return requestJson('/v2/me/preferences', UserDisplayPreferenceSchema, 4_096, {
        ...base, method: 'PUT', body: UserDisplayPreferenceChangeSchema.parse(input),
        maxRequestBytes: 2_048, headers: headers(ctx, proof), signal,
      })
    },
  }
}
