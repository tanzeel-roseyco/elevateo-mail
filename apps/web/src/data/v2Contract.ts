import { z } from 'zod'

// AIDEV-NOTE: V2 is disabled server-side; these strict boundaries prevent a future gateway from trusting draft wire data.
const id = z.uuid()
const revision = z.number().int().nonnegative()
export const OrganizationGrantSchema = z.strictObject({
  organization_id: id,
  user_id: id,
  role: z.enum(['organization_owner', 'organization_admin', 'organization_member']),
  revision,
})
export const GrantChangeSchema = z.strictObject({
  role: z.enum(['organization_admin', 'organization_member']),
  expected_revision: revision,
})
export const OrganizationGrantsSchema = z.strictObject({
  revision,
  grants: z.array(OrganizationGrantSchema).max(100),
})
export const OutreachPlanSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  mode: z.literal('simulation'),
})
export const OutreachCampaignSchema = z.strictObject({
  id,
  name: z.string().min(1).max(120),
  mode: z.literal('simulation'),
  status: z.literal('draft'),
})
export const WorkerJobSchema = z.strictObject({
  id,
  status: z.enum(['queued', 'leased', 'completed', 'failed']),
})
export type OrganizationGrant = z.infer<typeof OrganizationGrantSchema>
export type GrantChange = z.infer<typeof GrantChangeSchema>
export type OutreachPlan = z.infer<typeof OutreachPlanSchema>
export type OutreachCampaign = z.infer<typeof OutreachCampaignSchema>
