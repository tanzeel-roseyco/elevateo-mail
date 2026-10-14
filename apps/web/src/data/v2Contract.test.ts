import { describe, expect, it } from 'vitest'
import { GrantChangeSchema, OrganizationGrantsSchema, OutreachPlanSchema, WorkerJobSchema } from './v2Contract'

const jobId = '00000000-0000-4000-8000-000000000001'

describe('V2 draft boundary', () => {
  it('accepts bounded simulation and redacted worker status', () => {
    expect(OutreachPlanSchema.parse({ id: jobId, operation_id: jobId, name: 'Pilot', status: 'draft' }).status).toBe('draft')
    expect(WorkerJobSchema.parse({ id: jobId, status: 'queued' }).status).toBe('queued')
  })
  it('rejects any live outreach mode or unknown fields', () => {
    expect(OutreachPlanSchema.safeParse({ id: jobId, operation_id: jobId, name: 'Pilot', status: 'live' }).success).toBe(false)
    expect(OutreachPlanSchema.safeParse({ id: jobId, operation_id: jobId, name: 'Pilot', status: 'draft', recipient: 'x@y.example' }).success).toBe(false)
  })
  it('requires the protected actor grant independently of page position', () => {
    const actor = { organization_id: jobId, user_id: jobId, role: 'organization_admin', revision: 2 }
    const page = { context_id: 'a'.repeat(16), authorization_version: 'b'.repeat(16), actor, items: [], next_cursor: null }
    expect(OrganizationGrantsSchema.parse(page).actor).toEqual(actor)
    const { actor: _discarded, ...withoutActor } = page
    expect(OrganizationGrantsSchema.safeParse(withoutActor).success).toBe(false)
  })
  it('rejects owner assignment and stale invalid revisions', () => {
    expect(GrantChangeSchema.safeParse({ role: 'organization_owner', expected_revision: 1 }).success).toBe(false)
    expect(GrantChangeSchema.safeParse({ role: 'organization_admin', expected_revision: -1 }).success).toBe(false)
  })
})
