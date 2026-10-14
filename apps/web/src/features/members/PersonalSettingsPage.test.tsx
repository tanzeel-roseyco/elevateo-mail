import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GatewayError } from '@/data/errors'
import { PersonalSettingsPage } from './PersonalSettingsPage'

const { read, update, request, sessionState } = vi.hoisted(() => ({
  read: vi.fn(), update: vi.fn(),
  sessionState: { current: { status: 'ready', session: {
    actor: { id: 'user-1', display_name: 'Original' },
    organization: { id: 'org-1' }, context_id: 'ctx-1', authorization_version: 'v1',
  } } },
  request: vi.fn(async (work: (ctx: { contextId: string; authorizationVersion: string }, signal: AbortSignal) => Promise<unknown>) => {
    try { return { kind: 'ok' as const, value: await work({ contextId: 'ctx-1', authorizationVersion: 'v1' }, new AbortController().signal) } }
    catch (error) { return { kind: 'failed' as const, error } }
  }),
}))
vi.mock('@/data/v2Gateway', () => ({ createV2Gateway: () => ({ getUserDisplayPreference: read, updateUserDisplayPreference: update }) }))
vi.mock('@/app/protectedRequest', () => ({ useProtectedRequest: () => ({ request, proof: { csrfToken: 'csrf' } }) }))
vi.mock('@/app/session', () => ({ useSession: () => ({ state: sessionState.current }) }))

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.current = { status: 'ready', session: {
    actor: { id: 'user-1', display_name: 'Original' },
    organization: { id: 'org-1' }, context_id: 'ctx-1', authorization_version: 'v1',
  } }
  read.mockResolvedValue({ context_id: 'ctx-1', authorization_version: 'v1', display_name: 'Ada', revision: 2 })
  update.mockResolvedValue({ display_name: 'Grace', revision: 3 })
})

describe('personal settings', () => {
  it('loads own preference and saves with the expected revision', async () => {
    render(<PersonalSettingsPage />)
    expect(await screen.findByDisplayValue('Ada')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Grace' } })
    fireEvent.click(screen.getByText('Save display name'))
    await waitFor(() => expect(update).toHaveBeenCalledWith(
      { display_name: 'Grace', expected_revision: 2 }, expect.anything(), expect.anything(), expect.anything(),
    ))
    expect(await screen.findByText('Display name saved.')).toBeTruthy()
  })

  it('rejects invalid input before writing', async () => {
    render(<PersonalSettingsPage />)
    await screen.findByDisplayValue('Ada')
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: '   ' } })
    expect(screen.getByText('Save display name').hasAttribute('disabled')).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it('hides a denied preference without exposing server details', async () => {
    read.mockRejectedValue(new GatewayError('api', 'not_available', 'private detail', { status: 404 }))
    render(<PersonalSettingsPage />)
    expect(await screen.findByText('Personal settings unavailable')).toBeTruthy()
    expect(screen.queryByText('private detail')).toBeNull()
    expect(update).not.toHaveBeenCalled()
  })

  it('blocks stale writes until a fresh read', async () => {
    update.mockRejectedValue(new GatewayError('api', 'membership_conflict', 'stale', { status: 409 }))
    render(<PersonalSettingsPage />)
    await screen.findByDisplayValue('Ada')
    fireEvent.click(screen.getByText('Save display name'))
    expect(await screen.findByText('Your settings changed. Reload current settings before saving again.')).toBeTruthy()
    expect(screen.getByText('Save display name').hasAttribute('disabled')).toBe(true)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('does not replay a prior actor value after context changes', async () => {
    const page = render(<PersonalSettingsPage />)
    await screen.findByDisplayValue('Ada')
    sessionState.current = { status: 'ready', session: {
      actor: { id: 'user-2', display_name: 'Second' },
      organization: { id: 'org-1' }, context_id: 'ctx-2', authorization_version: 'v2',
    } }
    read.mockImplementation(() => new Promise(() => {}))
    page.rerender(<PersonalSettingsPage />)
    expect(screen.queryByDisplayValue('Ada')).toBeNull()
    expect(update).not.toHaveBeenCalled()
  })
})
