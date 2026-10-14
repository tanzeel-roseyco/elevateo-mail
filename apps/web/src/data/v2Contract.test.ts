import { describe, expect, it } from 'vitest'
import { GrantChangeSchema, OutreachPlanSchema, WorkerJobSchema } from './v2Contract'

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
  it('rejects owner assignment and stale invalid revisions', () => {
    expect(GrantChangeSchema.safeParse({ role: 'organization_owner', expected_revision: 1 }).success).toBe(false)
    expect(GrantChangeSchema.safeParse({ role: 'organization_admin', expected_revision: -1 }).success).toBe(false)
  })
})
