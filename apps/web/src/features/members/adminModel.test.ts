import { describe, expect, it } from 'vitest'
import { RosterPersonSchema } from '@/data/v2Contract'
import { CONFIG_PEOPLE, editableRoles, validActorProjection, validGrantProjection, validRosterProjection } from './adminModel'

const owner = { organization_id: '00000000-0000-4000-8000-000000000001', user_id: '00000000-0000-4000-8000-000000000002', role: 'organization_owner' as const, revision: 1 }
const member = { ...owner, user_id: '00000000-0000-4000-8000-000000000003', role: 'organization_member' as const }

describe('people and grant model', () => {
  it('keeps exactly twelve unbound configuration references without fabricated credentials', () => {
    expect(CONFIG_PEOPLE).toHaveLength(12)
    expect(new Set(CONFIG_PEOPLE.map((person) => person.key)).size).toBe(12)
    expect(CONFIG_PEOPLE.every((person) => person.email === null && person.auth_user_id === null && person.enrollment_state === 'unbound')).toBe(true)
  })
  it('requires the server roster to match exactly the unbound reference keys and names', () => {
    const rows = CONFIG_PEOPLE.map(({ key, display_name, title, department, enrollment_state }) =>
      RosterPersonSchema.parse({ key, display_name, title, department, enrollment_state }))
    expect(validRosterProjection(rows)).toBe(true)
    expect(validRosterProjection(rows.slice(1))).toBe(false)
    expect(validRosterProjection([{ ...rows[0]!, display_name: 'Changed' }, ...rows.slice(1)])).toBe(false)
  })
  it('offers owner edits only for another active grant and never owner transfer', () => {
    expect(editableRoles(owner, member)).toEqual(['organization_admin', 'technology_operator', 'sales_lead', 'sales_member', 'security_auditor', 'organization_member'])
    expect(editableRoles(owner, owner)).toEqual([])
  })
  it('rejects a cross-organization or duplicate grant projection', () => {
    expect(validGrantProjection(owner.organization_id, [owner, member])).toBe(true)
    expect(validGrantProjection(owner.organization_id, [owner, owner])).toBe(false)
    expect(validGrantProjection('different-organization', [owner])).toBe(false)
  })
  it('limits an admin to subordinate roles and no peer edit', () => {
    const admin = { ...owner, role: 'organization_admin' as const }
    expect(editableRoles(admin, member)).toEqual(['technology_operator', 'sales_lead', 'sales_member', 'security_auditor', 'organization_member'])
    expect(editableRoles(admin, owner)).toEqual([])
  })
  it('rejects stale or mismatched protected actor projections', () => {
    expect(validActorProjection(owner.organization_id, owner.user_id, owner)).toBe(true)
    expect(validActorProjection(owner.organization_id, owner.user_id, { ...owner, user_id: member.user_id })).toBe(false)
    expect(validActorProjection(owner.organization_id, owner.user_id, { ...owner, revision: 2 }, owner)).toBe(false)
    expect(validActorProjection(owner.organization_id, owner.user_id, { ...owner, role: 'organization_member' })).toBe(false)
    expect(editableRoles(member, owner)).toEqual([])
  })
})
