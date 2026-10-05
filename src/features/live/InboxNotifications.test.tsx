import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { live } from '@/data/http/instance'
import { InboxNotifications } from './InboxNotifications'

const port = vi.hoisted(() => ({ requestPermission: vi.fn(), show: vi.fn(() => ({ close: vi.fn() })) }))
vi.mock('@/data/http/instance', async () => {
  const { createStore } = await import('zustand/vanilla')
  return { live: { store: createStore(() => ({ accountId: null, session: { status: 'signed_out' }, mailboxes: [] })) } }
})
vi.mock('./inboxNotifications', async importOriginal => {
  const actual = await importOriginal<typeof import('./inboxNotifications')>()
  return { ...actual, createInboxNotifications: (source: Parameters<typeof actual.createInboxNotifications>[0]) => actual.createInboxNotifications(source, port) }
})

// AIDEV-NOTE: Exercise the real session controller while substituting only the OS notification boundary.
describe('inbox notification control', () => {
  beforeEach(() => {
    act(() => {
      live.store.setState({ accountId: null, session: { status: 'signed_out' }, mailboxes: [] })
      live.store.setState({ accountId: 'alice', session: { status: 'ready' } })
    })
    vi.clearAllMocks(); port.requestPermission.mockResolvedValue('granted')
  })
  it('requests permission only on explicit click and allows disabling', async () => {
    render(<InboxNotifications />)
    expect(port.requestPermission).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Enable inbox notifications' }))
    const disable = await screen.findByRole('button', { name: 'Turn off inbox notifications' })
    expect(port.requestPermission).toHaveBeenCalledOnce(); expect(port.show).not.toHaveBeenCalled()
    fireEvent.click(disable)
    expect(screen.getByRole('button', { name: 'Enable inbox notifications' })).toBeInTheDocument()
  })
  it('shows denied permission and clears active controls on logout', async () => {
    port.requestPermission.mockResolvedValue('denied'); render(<InboxNotifications />)
    fireEvent.click(screen.getByRole('button', { name: 'Enable inbox notifications' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not allowed')
    port.requestPermission.mockResolvedValue('granted')
    fireEvent.click(screen.getByRole('button', { name: 'Enable inbox notifications' }))
    await screen.findByRole('button', { name: 'Turn off inbox notifications' })
    act(() => live.store.setState({ accountId: null, session: { status: 'signed_out' } }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enable inbox notifications' })).toBeInTheDocument())
  })
})
