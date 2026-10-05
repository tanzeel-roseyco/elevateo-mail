import { z } from 'zod'

// AIDEV-NOTE: Defaults stay simulated; live campaigns require all independent release switches and an HTTPS opt-out origin.
const configSchema = z.object({
  PROVIDER_MODE: z.enum(['fake', 'resend', 'gmail', 'mixed']).default('fake'),
  GMAIL_ENABLED: z.enum(['true', 'false']).default('false'),
  GMAIL_SENDING_ENABLED: z.enum(['true', 'false']).default('false'),
  LIVE_SENDING: z.enum(['disabled', 'enabled']).default('disabled'),
  RESEND_SENDING_ENABLED: z.enum(['true', 'false']).default('false'),
  RESEND_CONNECTIONS_ENABLED: z.enum(['true', 'false']).default('false'),
  UNSUBSCRIBE_ORIGIN: z.string().max(2048).optional(),
  // AIDEV-NOTE: SQL enforces these constants; reject drift instead of claiming unused configurable limits.
  QUOTA_WINDOW_HOURS: z.coerce.number().pipe(z.literal(24)).default(24),
  MAILBOX_DAILY_LIMIT: z.coerce.number().pipe(z.literal(30)).default(30),
  USER_MAILBOX_LIMIT: z.coerce.number().pipe(z.literal(10)).default(10),
  DISPATCH_PAUSED: z.enum(['true', 'false']).default('true'),
  APPROVAL_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
}).refine(value => value.LIVE_SENDING !== 'enabled' ||
  (value.PROVIDER_MODE !== 'fake' &&
    (value.PROVIDER_MODE === 'gmail' || (value.RESEND_SENDING_ENABLED === 'true' &&
      value.RESEND_CONNECTIONS_ENABLED === 'true' && validOrigin(value.UNSUBSCRIBE_ORIGIN))) &&
    (value.PROVIDER_MODE === 'resend' || (value.GMAIL_ENABLED === 'true' && value.GMAIL_SENDING_ENABLED === 'true'))),
  { message: 'Live sending requires every selected provider release gate' })

function validOrigin(value: string | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.origin === value && !url.username && !url.password
  } catch { return false }
}

export type PolicyConfig = z.infer<typeof configSchema>
export function parsePolicyConfig(environment: unknown): PolicyConfig {
  return configSchema.parse(environment)
}
