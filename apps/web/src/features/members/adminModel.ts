import { z } from 'zod'
import type { OrganizationGrant } from '@/data/v2Contract'

// AIDEV-NOTE: Configuration identities are metadata, never Auth subjects or grant targets.
const ConfigPerson = z.strictObject({
  key: z.string().regex(/^elev-person-0(0[1-9]|1[0-2])$/),
  display_name: z.string().min(1).max(120),
  title: z.string().min(1).max(120),
  department: z.string().max(60).nullable(),
  email: z.null(),
  auth_user_id: z.null(),
  enrollment_state: z.literal('unbound'),
  proposed_org_role: z.enum(['organization_owner', 'organization_admin', 'technology_operator', 'sales_lead', 'sales_member', 'security_auditor', 'organization_member']),
})
export type ConfigPerson = z.infer<typeof ConfigPerson>

/** Exact SPEC-803 configuration references. They are not an active directory. */
export const CONFIG_PEOPLE: readonly ConfigPerson[] = [
  ['Allan Chan', 'CEO', null, 'organization_owner'],
  ['Callum McFarlane', 'Senior Partner', null, 'organization_admin'],
  ['Tanzeel Ahmad', 'Junior Partner', 'technology', 'technology_operator'],
  ['Hazem Dwek', 'Senior Partner', 'technology', 'technology_operator'],
  ['Jeison Mulder', 'Senior Partner', 'technology', 'technology_operator'],
  ['Lachlan MacDonald', 'Senior Partner', 'sales', 'sales_lead'],
  ['Thomas Charrier', 'Junior Partner', 'sales', 'sales_member'],
  ['Emil Larsen', 'Junior Partner', 'cybersecurity', 'security_auditor'],
  ['Roy Neven', 'Junior Partner', 'sales', 'sales_member'],
  ['Ben Pantis', 'Associate', null, 'organization_member'],
  ['Matthew', 'Associate; surname unresolved', null, 'organization_member'],
  ['Adria Pros', 'Sales representative', 'sales', 'sales_member'],
].map(([display_name, title, department, proposed_org_role], index) => ConfigPerson.parse({
  key: `elev-person-${String(index + 1).padStart(3, '0')}`,
  display_name, title, department, proposed_org_role,
  email: null, auth_user_id: null, enrollment_state: 'unbound',
}))

export type EditableRole = 'organization_admin' | 'organization_member'
/** UI hint only. The server checks current authority after every write lock. */
export function editableRoles(actorId: string, grants: readonly OrganizationGrant[], target: OrganizationGrant): readonly EditableRole[] {
  const actor = grants.find((grant) => grant.user_id === actorId)
  if (!actor || target.role === 'organization_owner' || actor.user_id === target.user_id) return []
  if (actor.role === 'organization_owner') return ['organization_admin', 'organization_member']
  if (actor.role === 'organization_admin' && target.role === 'organization_member') return ['organization_member']
  return []
}

/** Additional page invariant beyond the shared wire schema: no cross-organization grant can be rendered. */
export function validGrantProjection(organizationId: string, grants: readonly OrganizationGrant[]): boolean {
  const seen = new Set<string>()
  for (const grant of grants) {
    if (grant.organization_id !== organizationId || seen.has(grant.user_id)) return false
    seen.add(grant.user_id)
  }
  return true
}
