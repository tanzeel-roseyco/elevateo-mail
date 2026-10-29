// Simulated V2 administration (People/Members grants + roster) and Personal Details preference ports
// for the demo and dev-fixture entries ONLY. The production entry never wires them, so those pages
// keep the real createV2Gateway() port and its honest error state when no server answers.
//
// AIDEV-NOTE: Lives in src/dev (not src/data) because the roster reuses the members feature's
// CONFIG_PEOPLE so validRosterProjection accepts it. The actor grant is derived from the session the
// entry's main gateway reports, so validActorProjection holds whatever fixture session is scripted.
// All writes stay in memory and follow the real contract: revision checks answer 409.
import type { V2AdministrationPort, V2PreferencesPort } from '@/app/featureGateways'
import type { MailroomGateway, ReadContext } from '@/data/gateway'
import { GatewayError } from '@/data/errors'
import { GrantChangeSchema, OrganizationGrantsSchema, OrganizationGrantSchema, RosterPageSchema, type OrganizationGrant } from '@/data/v2Contract'
import { UserDisplayPreferenceChangeSchema, UserDisplayPreferencePageSchema, UserDisplayPreferenceSchema } from '@/data/v2PreferencesGateway'
import { CONFIG_PEOPLE } from '@/features/members/adminModel'

/** Other members of the simulated organization (fixed ids distinct from any fixture actor). */
const MEMBERS: readonly Pick<OrganizationGrant, 'user_id' | 'role'>[] = [
  { user_id: 'aaaaaaaa-0000-4000-8000-000000000002', role: 'organization_admin' },
  { user_id: 'aaaaaaaa-0000-4000-8000-000000000003', role: 'sales_lead' },
  { user_id: 'aaaaaaaa-0000-4000-8000-000000000004', role: 'sales_member' },
  { user_id: 'aaaaaaaa-0000-4000-8000-000000000005', role: 'security_auditor' },
]

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new GatewayError('transport', 'aborted', 'The request was cancelled.')
}
const envelope = (ctx: ReadContext) => ({ context_id: ctx.contextId, authorization_version: ctx.authorizationVersion })
const revisionConflict = () => new GatewayError('api', 'membership_conflict', 'The revision changed.', { status: 409 })

export function createSimulatedAdministrationGateway(identity: Pick<MailroomGateway, 'getSession'>): V2AdministrationPort {
  // Revisions and roles per organization, created on first read so any scripted session works.
  const organizations = new Map<string, Map<string, OrganizationGrant>>()
  async function grantsFor(organizationId: string, signal: AbortSignal | undefined) {
    const session = await identity.getSession(signal)
    let grants = organizations.get(organizationId)
    if (grants === undefined) {
      grants = new Map<string, OrganizationGrant>()
      grants.set(session.actor.id, { organization_id: organizationId, user_id: session.actor.id, role: 'organization_owner', revision: 1 })
      for (const member of MEMBERS) grants.set(member.user_id, { organization_id: organizationId, ...member, revision: 1 })
      organizations.set(organizationId, grants)
    }
    return { grants, actorId: session.actor.id }
  }
  return {
    async listOrganizationGrants(organizationId, ctx, signal, query = {}) {
      throwIfAborted(signal)
      // One page holds everything; any cursor is one this adapter never issued.
      if (query.cursor !== undefined) throw new GatewayError('api', 'cursor_invalid', 'Unknown cursor.', { status: 400 })
      const { grants, actorId } = await grantsFor(organizationId, signal)
      const actor = grants.get(actorId)
      if (actor === undefined) throw new GatewayError('api', 'not_available', 'Not available.', { status: 404 })
      const items = [...grants.values()].map((grant) => ({ ...grant }))
      return OrganizationGrantsSchema.parse({ ...envelope(ctx), actor: { ...actor }, items, next_cursor: null })
    },
    async getOrganizationRoster(_organizationId, ctx, signal, query = {}) {
      throwIfAborted(signal)
      if (query.cursor !== undefined) throw new GatewayError('api', 'cursor_invalid', 'Unknown cursor.', { status: 400 })
      const items = CONFIG_PEOPLE.map(({ key, display_name, title, department, enrollment_state }) => ({ key, display_name, title, department, enrollment_state }))
      return RosterPageSchema.parse({ ...envelope(ctx), items, next_cursor: null })
    },
    async replaceOrganizationGrant(organizationId, userId, change, _ctx, _proof, signal) {
      throwIfAborted(signal)
      const parsed = GrantChangeSchema.parse(change)
      const { grants } = await grantsFor(organizationId, signal)
      const current = grants.get(userId)
      if (current === undefined) throw new GatewayError('api', 'not_available', 'Not available.', { status: 404 })
      if (current.revision !== parsed.expected_revision) throw revisionConflict()
      const updated = OrganizationGrantSchema.parse({ ...current, role: parsed.role, revision: current.revision + 1 })
      grants.set(userId, updated)
      return { ...updated }
    },
  }
}

export function createSimulatedPreferencesGateway(): V2PreferencesPort {
  let preference: { display_name: string | null; revision: number } = { display_name: null, revision: 0 }
  return {
    async getUserDisplayPreference(ctx, signal) {
      throwIfAborted(signal)
      return UserDisplayPreferencePageSchema.parse({ ...envelope(ctx), ...preference })
    },
    async updateUserDisplayPreference(input, _ctx, _proof, signal) {
      throwIfAborted(signal)
      const change = UserDisplayPreferenceChangeSchema.parse(input)
      if (change.expected_revision !== preference.revision) throw revisionConflict()
      preference = UserDisplayPreferenceSchema.parse({ display_name: change.display_name, revision: preference.revision + 1 })
      return { ...preference }
    },
  }
}
