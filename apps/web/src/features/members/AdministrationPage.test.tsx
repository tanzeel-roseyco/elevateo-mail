import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GatewayError } from '@/data/errors'
import { AdministrationPage } from './AdministrationPage'

const ownerId = '00000000-0000-4000-8000-000000000002'
const targetId = '00000000-0000-4000-8000-000000000003'
const orgId = '00000000-0000-4000-8000-000000000001'
const owner = { organization_id: orgId, user_id: ownerId, role: 'organization_owner', revision: 2 }
const target = { organization_id: orgId, user_id: targetId, role: 'organization_member', revision: 2 }
const { list, replace, refresh, request } = vi.hoisted(() => ({
  list: vi.fn(), replace: vi.fn(), refresh: vi.fn(),
  request: vi.fn(async (work: (ctx: { contextId: string; authorizationVersion: string }, signal: AbortSignal) => Promise<unknown>): Promise<{ kind: 'ok'; value: unknown } | { kind: 'failed'; error: unknown } | { kind: 'stale' }> => {
    try { return { kind: 'ok' as const, value: await work({ contextId: 'ctx', authorizationVersion: 'v1' }, new AbortController().signal) } }
    catch (error) { return { kind: 'failed' as const, error } }
  }),
}))
vi.mock('@/data/v2Gateway', () => ({ createV2Gateway: () => ({ listOrganizationGrants: list, replaceOrganizationGrant: replace }) }))
vi.mock('@/app/protectedRequest', () => ({ useProtectedRequest: () => ({ request, proof: { csrfToken: 'test' } }) }))
vi.mock('@/app/session', () => ({ useSession: () => ({ refresh, state: { status: 'ready', session: { organization: { id: orgId }, actor: { id: ownerId } } } }) }))

beforeEach(() => { vi.clearAllMocks(); list.mockResolvedValue({ revision: 2, grants: [owner, target] }); replace.mockResolvedValue({ ...target, role: 'organization_admin', revision: 3 }) })

describe('administration page', () => {
  it('shows unbound references separately and sends a revision-bound edit for an active UUID', async () => {
    render(<AdministrationPage section="people" />)
    expect(await screen.findByText('Allan Chan')).toBeTruthy()
    expect(screen.getAllByText('Unbound · no email or login')).toHaveLength(12)
    await screen.findByText('Grant revision 2 · audit event details unavailable in this build')
    fireEvent.change(screen.getByLabelText(`Role for ${targetId}`), { target: { value: 'organization_admin' } })
    fireEvent.click(screen.getByText('Save role'))
    await waitFor(() => expect(replace).toHaveBeenCalledWith(orgId, targetId, { role: 'organization_admin', expected_revision: 2 }, expect.anything(), expect.anything(), expect.anything()))
    expect(refresh).toHaveBeenCalled()
    expect(replace.mock.calls[0]?.[1]).not.toBe('elev-person-001')
  })
  it('shows a generic denial and no active identities', async () => {
    list.mockRejectedValue(new GatewayError('api', 'not_available', 'secret', { status: 404 }))
    render(<AdministrationPage section="organization" />)
    await waitFor(() => expect(screen.getByText('Administration unavailable')).toBeTruthy())
    expect(screen.queryByText('secret')).toBeNull()
    expect(screen.queryByText(`Role for ${targetId}`)).toBeNull()
  })
  it('drops a revoked-session read before showing active grants', async () => {
    request.mockResolvedValueOnce({ kind: 'stale' })
    render(<AdministrationPage section="people" />)
    expect(await screen.findByText('Allan Chan')).toBeTruthy()
    expect(screen.queryByText(`Role for ${targetId}`)).toBeNull()
    expect(replace).not.toHaveBeenCalled()
  })
  it('does not retry a stale role write', async () => {
    replace.mockRejectedValue(new GatewayError('api', 'membership_conflict', 'stale', { status: 409 }))
    render(<AdministrationPage section="people" />)
    await screen.findByText('Grant revision 2 · audit event details unavailable in this build')
    fireEvent.change(screen.getByLabelText(`Role for ${targetId}`), { target: { value: 'organization_admin' } })
    fireEvent.click(screen.getByText('Save role'))
    await waitFor(() => expect(screen.getByText('The grant revision changed. Reload current permissions before another change.')).toBeTruthy())
    expect(replace).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Save role').hasAttribute('disabled')).toBe(true)
  })
})
