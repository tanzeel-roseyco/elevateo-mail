import { z } from 'zod'

// AIDEV-NOTE: These conservative simulation defaults are policy proposals, not permission for live integration.
const configSchema = z.object({
  PROVIDER_MODE: z.literal('fake').default('fake'),
  LIVE_SENDING: z.literal('disabled').default('disabled'),
  // AIDEV-NOTE: SQL enforces these constants; reject drift instead of claiming unused configurable limits.
  QUOTA_WINDOW_HOURS: z.coerce.number().pipe(z.literal(24)).default(24),
  MAILBOX_DAILY_LIMIT: z.coerce.number().pipe(z.literal(30)).default(30),
  USER_MAILBOX_LIMIT: z.coerce.number().pipe(z.literal(10)).default(10),
  DISPATCH_PAUSED: z.enum(['true', 'false']).default('true'),
  APPROVAL_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
})

export type PolicyConfig = z.infer<typeof configSchema>
export function parsePolicyConfig(environment: unknown): PolicyConfig {
  return configSchema.parse(environment)
}
