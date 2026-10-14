import { describe, expect, it } from 'vitest'
import { GrantChangeSchema, OutreachPlanSchema, WorkerJobSchema } from './v2Contract'

const jobId = '00000000-0000-4000-8000-000000000001'

describe('V2 draft boundary', () => {
  it('accepts bounded simulation and redacted worker status', () => {
    expect(OutreachPlanSchema.parse({ name: 'Pilot', mode: 'simulation' }).mode).toBe('simulation')
    expect(WorkerJobSchema.parse({ id: jobId, status: 'queued' }).status).toBe('queued')
  })
  it('rejects any live outreach mode or unknown fields', () => {
    expect(OutreachPlanSchema.safeParse({ name: 'Pilot', mode: 'live' }).success).toBe(false)
    expect(OutreachPlanSchema.safeParse({ name: 'Pilot', mode: 'simulation', recipient: 'x@y.example' }).success).toBe(false)
  })
  it('rejects owner assignment and stale invalid revisions', () => {
    expect(GrantChangeSchema.safeParse({ role: 'organization_owner', expected_revision: 1 }).success).toBe(false)
    expect(GrantChangeSchema.safeParse({ role: 'organization_admin', expected_revision: -1 }).success).toBe(false)
  })
})
