import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { GatewayError } from '@/data/errors'
import { AdministrationPage } from './AdministrationPage'
import { CONFIG_PEOPLE, type AdminGateway } from './adminModel'

const request = vi.fn(async (work: (ctx: { contextId: string; authorizationVersion: string }, signal: AbortSignal) => Promise<unknown>) => {
  try { return { kind: 'ok' as const, value: await work({ contextId: 'ctx', authorizationVersion: 'v1' }, new AbortController().signal) } }
  catch (error) { return { kind: 'failed' as const, error } }
})
vi.mock('@/app/protectedRequest', () => ({ useProtectedRequest: () => ({ request, proof: { csrfToken: 'test' } }) }))
vi.mock('@/app/session', () => ({ useSession: () => ({ refresh: vi.fn() }) }))

const snapshot = { revision: 2, can_manage_grants: true, people: CONFIG_PEOPLE, grants: [] }

describe('administration page', () => {
  it('shows unbound people without offering grant writes', async () => {
    const write = vi.fn()
    const gateway: AdminGateway = { listOrganizationGrants: vi.fn().mockResolvedValue(snapshot), replaceOrganizationGrant: write }
    render(<AdministrationPage gateway={gateway} section="people" />)
    expect(await screen.findByText('Allan Chan')).toBeTruthy()
    expect(screen.getAllByText('Unbound · no email or login')).toHaveLength(12)
    expect(screen.queryByText('Review grant')).toBeNull()
    expect(write).not.toHaveBeenCalled()
  })
  it('uses generic unavailable copy on a denied roster', async () => {
    const gateway: AdminGateway = { listOrganizationGrants: vi.fn().mockRejectedValue(new GatewayError('api', 'not_available', 'secret', { status: 404 })), replaceOrganizationGrant: vi.fn() }
    render(<AdministrationPage gateway={gateway} section="people" />)
    await waitFor(() => expect(screen.getByText('Administration unavailable')).toBeTruthy())
    expect(screen.queryByText('secret')).toBeNull()
  })
})
