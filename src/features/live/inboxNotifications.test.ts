import { describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import type { LiveState } from '@/data/http/live'
import type { ServerMailbox } from '@/data/http/contract'
import { createInboxNotifications } from './inboxNotifications'

const mailbox = (arrivalCount: number, id = 'mail'): ServerMailbox => ({ id, address: 'a@example.com', provider: 'gmail',
  connected: true, sendEnabled: false, aiRead: false, aiDraft: false, aiSend: false, arrivalCount })
function setup(permission: Promise<NotificationPermission> = Promise.resolve('granted')) {
  const source = createStore<Pick<LiveState, 'accountId' | 'session' | 'mailboxes'>>(() => ({ accountId: 'alice', session: { status: 'ready' }, mailboxes: [mailbox(5)] }))
  const close = vi.fn()
  const port = { requestPermission: vi.fn(() => permission), show: vi.fn(() => ({ close })) }
  const controller = createInboxNotifications(source, port)
  return { source, port, close, controller }
}
// AIDEV-NOTE: Counters, not message lists, avoid notifications for pagination, historical imports, or full scans.
describe('session inbox notifications', () => {
  it('requires opt-in; baselines existing and new mailboxes; deduplicates refresh and closes on logout', async () => {
    const { source, port, close, controller } = setup()
    source.setState({ mailboxes: [mailbox(6)] }); expect(port.show).not.toHaveBeenCalled()
    expect(port.requestPermission).not.toHaveBeenCalled()
    await controller.enable(); expect(port.show).not.toHaveBeenCalled()
    source.setState({ mailboxes: [mailbox(7), mailbox(100, 'new')] })
    expect(port.show).toHaveBeenCalledOnce()
    source.setState({ mailboxes: [mailbox(7), mailbox(100, 'new')] })
    expect(port.show).toHaveBeenCalledOnce()
    source.setState({ session: { status: 'signed_out' }, accountId: null })
    expect(close).toHaveBeenCalledOnce(); expect(controller.store.getState().enabled).toBe(false)
    source.setState({ session: { status: 'ready' }, accountId: 'bob', mailboxes: [mailbox(900)] })
    expect(port.show).toHaveBeenCalledOnce(); controller.destroy()
  })
  it('fences account changes while permission is pending', async () => {
    let resolve!: (value: NotificationPermission) => void
    const { source, port, controller } = setup(new Promise(done => { resolve = done }))
    const pending = controller.enable()
    source.setState({ accountId: 'bob', mailboxes: [mailbox(99)] })
    resolve('granted'); await pending
    expect(controller.store.getState()).toEqual({ enabled: false, pending: false, error: null })
    source.setState({ mailboxes: [mailbox(100)] }); expect(port.show).not.toHaveBeenCalled(); controller.destroy()
  })
  it('handles denied permission and display failure without silently staying enabled', async () => {
    const denied = setup(Promise.resolve('denied')); await denied.controller.enable()
    expect(denied.controller.store.getState().error).toMatch(/not allowed/); denied.controller.destroy()
    const active = setup(); await active.controller.enable()
    active.port.show.mockImplementation(() => { throw new Error('Unavailable') })
    active.source.setState({ mailboxes: [mailbox(6)] })
    expect(active.controller.store.getState().enabled).toBe(false)
    expect(active.controller.store.getState().error).toMatch(/could not be displayed/); active.controller.destroy()
  })
  it('ignores disconnected mailboxes and counter resets', async () => {
    const { source, port, controller } = setup(); await controller.enable()
    source.setState({ mailboxes: [mailbox(0)] }); source.setState({ mailboxes: [{ ...mailbox(50), connected: false }] })
    expect(port.show).not.toHaveBeenCalled(); controller.destroy()
  })
})
