import { z } from 'zod'
import { MessageSchema } from './contract'

// AIDEV-NOTE: V2 remains an isolated source candidate; strict boundaries reject malformed wire data.
export const IdSchema = z.uuid()
const id = IdSchema
const revision = z.number().int().nonnegative()
const hasNoControl = (value: string): boolean => Array.from(value).every((character) => {
  const code = character.codePointAt(0)
  return code !== undefined && code >= 32 && (code < 127 || code > 159)
})
export const OrganizationGrantSchema = z.strictObject({
  organization_id: id,
  user_id: id,
  role: z.enum(['organization_owner', 'organization_admin', 'technology_operator', 'sales_lead', 'sales_member', 'security_auditor', 'organization_member']),
  revision,
})
export const GrantChangeSchema = z.strictObject({
  role: z.enum(['organization_admin', 'technology_operator', 'sales_lead', 'sales_member', 'security_auditor', 'organization_member']),
  expected_revision: revision,
})
export const OrganizationGrantsSchema = z.strictObject({
  context_id: z.string().min(16).max(256),
  authorization_version: z.string().min(16).max(256),
  actor: OrganizationGrantSchema,
  items: z.array(OrganizationGrantSchema).max(50),
  next_cursor: z.string().max(2048).nullable(),
})
export const OutreachPlanSchema = z.strictObject({
  id, operation_id: id, name: z.string().min(1).max(160),
  status: z.enum(['draft', 'paused']),
})
export const OutreachCampaignSchema = z.strictObject({
  id,
  name: z.string().min(1).max(160),
  status: z.enum(['draft', 'paused']),
  version: z.number().int().min(1).max(2_147_483_647),
})
export const WorkerJobSchema = z.strictObject({
  id,
  status: z.enum(['queued', 'leased', 'completed', 'failed']),
})
export type OrganizationGrant = z.infer<typeof OrganizationGrantSchema>
export type GrantChange = z.infer<typeof GrantChangeSchema>
export type OutreachPlan = z.infer<typeof OutreachPlanSchema>
export type OutreachCampaign = z.infer<typeof OutreachCampaignSchema>

export const CampaignPageSchema = z.strictObject({ items: z.array(OutreachCampaignSchema).max(100), next_cursor: id.nullable() })

export const RosterPersonSchema = z.strictObject({
  key: z.string().regex(/^elev-person-0(0[1-9]|1[0-2])$/),
  display_name: z.string().min(1).max(96),
  title: z.string().min(1).max(96),
  department: z.enum(['technology', 'sales', 'cybersecurity']).nullable(),
  enrollment_state: z.literal('unbound'),
})
export const RosterPageSchema = z.strictObject({
  context_id: z.string().min(16).max(256),
  authorization_version: z.string().min(16).max(256),
  items: z.array(RosterPersonSchema).max(50),
  next_cursor: z.string().max(2048).nullable(),
})

export const LeadSummarySchema = z.strictObject({
  id, campaign_id: id, email: z.email().max(254),
  consent_status: z.enum(['unknown', 'granted', 'withdrawn']),
  suppressed: z.boolean(), version: z.number().int().min(1),
})
export const LeadDetailSchema = z.strictObject({
  ...LeadSummarySchema.shape,
  consent_recorded_at: z.iso.datetime({ offset: false, local: false }).nullable(),
  consent_source: z.string().min(1).max(200).refine(hasNoControl).nullable(),
  consent_recorded_by: id.nullable(),
  consent_evidence_kind: z.literal('manual_attestation').nullable(),
})
export const LeadPageSchema = z.strictObject({ items: z.array(LeadSummarySchema).max(100), next_cursor: id.nullable() })
export const CampaignAnalyticsSchema = z.strictObject({
  campaign_id: id, lead_count: z.number().int().nonnegative(), consented_count: z.number().int().nonnegative(),
}).refine((value) => value.consented_count <= value.lead_count)

export const CampaignUpdateSchema = z.strictObject({
  operation_id: id, expected_version: z.number().int().min(1),
  name: z.string().min(1).max(160), status: z.enum(['draft', 'paused']),
})
export const LeadCreateSchema = z.strictObject({ id, operation_id: id, email: z.email().max(254) })
export const LeadUpdateSchema = z.strictObject({
  operation_id: id, expected_version: z.number().int().min(1), email: z.email().max(254),
})
export const LeadConsentAttestationSchema = z.strictObject({
  operation_id: id, expected_version: z.number().int().min(1).max(2_147_483_646),
  source: z.string().min(1).max(200).refine(hasNoControl).refine((value) => value.trim().length > 0),
  observed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/).refine((value) => {
    const parsed = new Date(value)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().replace('.000Z', 'Z') === value &&
      parsed.getTime() <= Date.now() + 300_000
  }),
  attested: z.literal(true),
})

export const AccountSummarySchema = z.strictObject({
  id, campaign_id: id, mailbox_id: id, label: z.string().min(1).max(120),
  status: z.literal('disabled'), version: z.number().int().min(1),
})
export const AccountPageSchema = z.strictObject({ items: z.array(AccountSummarySchema).max(100), next_cursor: id.nullable() })

export const DirectMessagePageSchema = z.strictObject({
  context_id: z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/),
  authorization_version: z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/),
  mailbox_id: id,
  thread_id: id,
  message: MessageSchema,
})
