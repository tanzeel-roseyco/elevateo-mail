import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GatewayError } from '@/data/errors'
import { RequestScope } from '@/app/scope'
import { PersonalSettingsPage } from './PersonalSettingsPage'

const { read, update, sessionState, readContext } = vi.hoisted(() => ({
  read: vi.fn<(...args: [unknown, AbortSignal]) => Promise<unknown>>(),
  update: vi.fn<(...args: [unknown, unknown, unknown, AbortSignal]) => Promise<unknown>>(),
  readContext: { current: { contextId: 'ctx-1', authorizationVersion: 'v1' } },
  sessionState: { current: { status: 'ready', session: {
    actor: { id: 'user-1', display_name: 'Original' },
    organization: { id: 'org-1' }, context_id: 'ctx-1', authorization_version: 'v1', csrf_token: 'csrf',
  } } },
}))
const scope = new RequestScope()
const handleError = () => false
vi.mock('@/data/v2Gateway', () => ({ createV2Gateway: () => ({ getUserDisplayPreference: read, updateUserDisplayPreference: update }) }))
vi.mock('@/app/session', () => ({ useSession: () => ({
  state: sessionState.current,
  scope,
  context: readContext.current,
  handleError,
}) }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  scope.invalidate()
  readContext.current = { contextId: 'ctx-1', authorizationVersion: 'v1' }
  sessionState.current = { status: 'ready', session: {
    actor: { id: 'user-1', display_name: 'Original' },
    organization: { id: 'org-1' }, context_id: 'ctx-1', authorization_version: 'v1', csrf_token: 'csrf',
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

  it('rejects a read from another authorization context', async () => {
    read.mockResolvedValue({ context_id: 'other', authorization_version: 'v1', display_name: 'Foreign', revision: 2 })
    render(<PersonalSettingsPage />)
    expect(await screen.findByText('Personal settings could not be loaded')).toBeTruthy()
    expect(screen.queryByDisplayValue('Foreign')).toBeNull()
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

  it('aborts a pending old read and ignores its late reply after the new actor loads', async () => {
    const oldRead = deferred<{ context_id: string; authorization_version: string; display_name: string; revision: number }>()
    read.mockReset()
      .mockImplementationOnce(() => oldRead.promise)
      .mockResolvedValueOnce({ context_id: 'ctx-2', authorization_version: 'v2', display_name: 'Second', revision: 9 })
    const page = render(<PersonalSettingsPage key="user-1" />)
    expect(read).toHaveBeenCalledTimes(1)
    const oldSignal = read.mock.calls[0]?.[1]
    if (!oldSignal) throw new Error('Old read did not receive an abort signal')
    expect(oldSignal.aborted).toBe(false)

    scope.invalidate()
    sessionState.current = { status: 'ready', session: {
      actor: { id: 'user-2', display_name: 'Second' },
      organization: { id: 'org-1' }, context_id: 'ctx-2', authorization_version: 'v2', csrf_token: 'csrf',
    } }
    readContext.current = { contextId: 'ctx-2', authorizationVersion: 'v2' }
    page.rerender(<PersonalSettingsPage key="user-2" />)
    expect(oldSignal.aborted).toBe(true)
    expect(await screen.findByDisplayValue('Second')).toBeTruthy()
    await act(async () => { oldRead.resolve({ context_id: 'ctx-1', authorization_version: 'v1', display_name: 'Late old value', revision: 3 }); await oldRead.promise })
    expect(screen.queryByDisplayValue('Late old value')).toBeNull()
    expect(screen.getByDisplayValue('Second')).toBeTruthy()
  })

  it('aborts a pending old write and keeps the new actor revision after its late reply', async () => {
    const oldWrite = deferred<{ display_name: string; revision: number }>()
    update.mockReset().mockImplementationOnce(() => oldWrite.promise)
      .mockResolvedValueOnce({ display_name: 'New save', revision: 10 })
    const page = render(<PersonalSettingsPage key="user-1" />)
    await screen.findByDisplayValue('Ada')
    fireEvent.click(screen.getByText('Save display name'))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    const oldSignal = update.mock.calls[0]?.[3]
    if (!oldSignal) throw new Error('Old write did not receive an abort signal')
    expect(oldSignal.aborted).toBe(false)

    scope.invalidate()
    sessionState.current = { status: 'ready', session: {
      actor: { id: 'user-2', display_name: 'Second' },
      organization: { id: 'org-1' }, context_id: 'ctx-2', authorization_version: 'v2', csrf_token: 'csrf',
    } }
    readContext.current = { contextId: 'ctx-2', authorizationVersion: 'v2' }
    read.mockResolvedValue({ context_id: 'ctx-2', authorization_version: 'v2', display_name: 'Second', revision: 9 })
    page.rerender(<PersonalSettingsPage key="user-2" />)
    expect(oldSignal.aborted).toBe(true)
    expect(await screen.findByDisplayValue('Second')).toBeTruthy()
    await act(async () => { oldWrite.resolve({ display_name: 'Late old save', revision: 3 }); await oldWrite.promise })
    expect(screen.queryByText('Display name saved.')).toBeNull()
    expect(screen.queryByDisplayValue('Late old save')).toBeNull()
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'New save' } })
    fireEvent.click(screen.getByText('Save display name'))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2))
    expect(update.mock.calls[1]?.[0]).toEqual({ display_name: 'New save', expected_revision: 9 })
  })
})
