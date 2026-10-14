import { z } from 'zod'
import type { CsrfProof, ReadContext } from '@/data/gateway'

export const OrgRole = z.enum(['organization_owner', 'organization_admin', 'technology_operator', 'sales_lead', 'sales_member', 'security_auditor', 'organization_member'])
export type OrgRole = z.infer<typeof OrgRole>
export const Person = z.strictObject({
  key: z.string().regex(/^elev-person-0(0[1-9]|1[0-2])$/),
  display_name: z.string().min(1).max(120),
  title: z.string().min(1).max(120),
  department: z.string().max(60).nullable(),
  email: z.null(),
  auth_user_id: z.null(),
  enrollment_state: z.literal('unbound'),
  proposed_org_role: OrgRole,
})
export type Person = z.infer<typeof Person>
export const Grant = z.strictObject({ person_key: Person.shape.key, role: OrgRole })
export const AdminSnapshot = z.strictObject({
  revision: z.number().int().nonnegative(),
  can_manage_grants: z.boolean(),
  people: z.array(Person).max(12),
  grants: z.array(Grant).max(12),
})
export type AdminSnapshot = z.infer<typeof AdminSnapshot>

/** Draft port for Cassian's additive V2 gateway; no direct fetch or implicit authority in the view. */
export interface AdminGateway {
  listOrganizationGrants(ctx: ReadContext, signal: AbortSignal): Promise<unknown>
  replaceOrganizationGrant(ctx: ReadContext, proof: CsrfProof, personKey: string, role: OrgRole, expectedRevision: number, signal: AbortSignal): Promise<unknown>
}

export function validateAdminSnapshot(value: unknown): AdminSnapshot {
  const snapshot = AdminSnapshot.parse(value)
  const keys = new Set<string>()
  for (const person of snapshot.people) {
    if (keys.has(person.key)) throw new Error('Duplicate person key')
    keys.add(person.key)
  }
  const granted = new Set<string>()
  for (const grant of snapshot.grants) {
    if (!keys.has(grant.person_key) || granted.has(grant.person_key)) throw new Error('Invalid grant binding')
    granted.add(grant.person_key)
  }
  return snapshot
}

/** Configuration references are display metadata only; they never authenticate a person. */
export const CONFIG_PEOPLE: readonly Person[] = [
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
].map(([display_name, title, department, proposed_org_role], index) => Person.parse({
  key: `elev-person-${String(index + 1).padStart(3, '0')}`,
  display_name, title, department, proposed_org_role,
  email: null, auth_user_id: null, enrollment_state: 'unbound',
}))
