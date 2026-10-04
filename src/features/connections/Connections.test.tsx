import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gateway } from '@/data/gateway'
import { createSeed } from '@/data/seed'
import { useData } from '@/data/store'
import { AssistantPage } from '@/features/assistant/AssistantPage'
import { ConfirmHost } from '@/ui/confirm'
import { openDraft } from '@/features/compose/composerStore'
import { clearToasts, Toaster } from '@/ui/toast'
import { ConnectionsPage } from './ConnectionsPage'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/connections/:section" element={<ConnectionsPage />} />
        <Route path="/assistant" element={<AssistantPage />} />
      </Routes>
      <Toaster />
      <ConfirmHost />
    </MemoryRouter>,
  )
}

const connections = () => useData.getState().connections
const mailboxList = () => screen.findByRole('list', { name: 'Connected mailboxes' })

beforeEach(() => useData.getState().replaceAll(createSeed(Date.now())))
afterEach(() => {
  vi.restoreAllMocks()
  // The toast store is a module singleton: without this a toast from one test is still on screen in the next.
  clearToasts()
})

vi.mock('@/features/compose/composerStore', () => ({ openDraft: vi.fn() }))

describe('Connections → Mailboxes', () => {
  it('shows a loading state, then the nine demo mailboxes with their daily usage', async () => {
    renderAt('/connections/mailboxes')
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    const list = await mailboxList()
    expect(within(list).getAllByRole('listitem')).toHaveLength(9)
    expect(screen.getByText(/9 of 10 mailboxes connected/)).toHaveTextContent('at most 270 a day')
    expect(within(list).getAllByText(/\/ 30 sent today/)).toHaveLength(9)
  })

  it('shows an error with a working retry when connections cannot be loaded', async () => {
    vi.spyOn(gateway, 'loadConnections').mockRejectedValueOnce(new Error('Simulated outage'))
    renderAt('/connections/mailboxes')
    expect(await screen.findByRole('alert')).toHaveTextContent('Simulated outage')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await mailboxList()).toBeInTheDocument()
  })

  it('rejects a malformed or duplicate address without changing anything', async () => {
    renderAt('/connections/mailboxes')
    await mailboxList()
    const input = screen.getByLabelText('Mailbox address')
    await userEvent.type(input, 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Connect mailbox (simulated)' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a full email address')
    await userEvent.clear(input)
    await userEvent.type(input, 'lachlan+promo@boltloop.co')
    await userEvent.click(screen.getByRole('button', { name: 'Connect mailbox (simulated)' }))
    expect(screen.getByRole('alert')).toHaveTextContent('already connected')
    expect(connections().mailboxes).toHaveLength(9)
  })

  it('connects a tenth mailbox read-only, then closes the form at the limit', async () => {
    renderAt('/connections/mailboxes')
    await mailboxList()
    await userEvent.type(screen.getByLabelText('Mailbox address'), 'Tenth@Example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Connect mailbox (simulated)' }))
    expect(await screen.findByText(/All 10 mailbox places are in use/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Mailbox address')).not.toBeInTheDocument()
    const added = connections().mailboxes.at(-1)!
    expect(added).toMatchObject({ address: 'tenth@example.com', sendEnabled: false })
    expect(screen.getByText(/No Google account was contacted/)).toBeInTheDocument()
  })

  it('disconnects an added mailbox after confirmation and removes it from the AI scope', async () => {
    const { id } = await gateway.connectMailbox('tenth@example.com')
    await gateway.updateAiAccess({ readMailboxIds: [...connections().ai.readMailboxIds, id] })
    renderAt('/connections/mailboxes')
    const list = await mailboxList()
    // Demo mailboxes offer no Disconnect, so the only button belongs to the added one.
    await userEvent.click(within(list).getByRole('button', { name: 'Disconnect' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))
    await waitFor(() => expect(connections().mailboxes).toHaveLength(9))
    expect(connections().ai.readMailboxIds).not.toContain(id)
  })

  it('keeps the mailbox when the disconnect confirmation is cancelled', async () => {
    await gateway.connectMailbox('tenth@example.com')
    const disconnect = vi.spyOn(gateway, 'disconnectMailbox')
    renderAt('/connections/mailboxes')
    await userEvent.click(within(await mailboxList()).getByRole('button', { name: 'Disconnect' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(disconnect).not.toHaveBeenCalled()
    expect(connections().mailboxes).toHaveLength(10)
  })

  it('shows the reason and changes nothing when the gateway rejects a connection', async () => {
    vi.spyOn(gateway, 'connectMailbox').mockRejectedValueOnce(new Error('Simulated provider refusal'))
    renderAt('/connections/mailboxes')
    await mailboxList()
    await userEvent.type(screen.getByLabelText('Mailbox address'), 'tenth@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Connect mailbox (simulated)' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Simulated provider refusal')
    expect(connections().mailboxes).toHaveLength(9)
    expect(screen.getByRole('button', { name: 'Connect mailbox (simulated)' })).toBeEnabled()
  })

  it('pauses connect and import while the browser is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderAt('/connections/mailboxes')
    const list = await mailboxList()
    expect(screen.getByRole('button', { name: 'Connect mailbox (simulated)' })).toBeDisabled()
    for (const button of within(list).getAllByRole('button', { name: 'Import history (simulated)' })) expect(button).toBeDisabled()
  })

  it('refuses to disconnect a demo mailbox at the gateway', async () => {
    await expect(gateway.disconnectMailbox(connections().mailboxes[0]!.id)).rejects.toThrow('Demo mailboxes cannot be disconnected')
    await expect(gateway.disconnectMailbox('mbx-missing')).rejects.toThrow('no longer connected')
  })

  it('records a simulated history import for one mailbox', async () => {
    renderAt('/connections/mailboxes')
    const list = await mailboxList()
    await userEvent.click(within(list).getAllByRole('button', { name: 'Import history (simulated)' })[0]!)
    await waitFor(() => expect(connections().mailboxes[0]!.historyImport).toBe('complete'))
    expect(within(list).getAllByRole('button', { name: 'Import history (simulated)' })).toHaveLength(8)
  })
})

describe('Connections → other sections', () => {
  it('keeps Google and Resend routes separate and lists the open limit decisions', async () => {
    renderAt('/connections/sending')
    expect(await screen.findByRole('heading', { name: /Two separate routes/ })).toBeInTheDocument()
    expect(screen.getByText('hello@updates.boltloop.co')).toBeInTheDocument()
    expect(screen.getByText(/Two limit rules still need your decision/)).toBeInTheDocument()
    expect(screen.getByText(/do not guarantee that mail reaches an inbox/)).toBeInTheDocument()
  })

  it('narrows and widens what the assistant may read and do', async () => {
    renderAt('/connections/ai')
    const first = await screen.findByRole('checkbox', { name: /lachlan\.macdonald@boltloop\.co/ })
    expect(first).toBeChecked()
    await userEvent.click(first)
    await waitFor(() => expect(connections().ai.readMailboxIds).toEqual([]))
    await waitFor(() => expect(first).toBeEnabled())
    await userEvent.click(first)
    await waitFor(() => expect(connections().ai.readMailboxIds).toEqual(['mbx-lachlan.macdonald@boltloop.co']))
    const send = screen.getByRole('switch', { name: 'Send with my approval' })
    expect(send).toHaveAttribute('aria-checked', 'false')
    await waitFor(() => expect(send).toBeEnabled())
    await userEvent.click(send)
    await waitFor(() => expect(connections().ai.allowSend).toBe(true))
    const drafts = screen.getByRole('switch', { name: 'Prepare drafts' })
    await waitFor(() => expect(drafts).toBeEnabled())
    await userEvent.click(drafts)
    await waitFor(() => expect(connections().ai.allowDrafts).toBe(false))
    await waitFor(() => expect(drafts).toHaveAttribute('aria-checked', 'false'))
  })

  it('locks the controls while a change is pending so a second click cannot use stale scope', async () => {
    let release!: () => void
    vi.spyOn(gateway, 'updateAiAccess').mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(connections().ai))))
    renderAt('/connections/ai')
    const first = await screen.findByRole('checkbox', { name: /lachlan\.macdonald@boltloop\.co/ })
    await userEvent.click(first)
    expect(first).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Send with my approval' })).toBeDisabled()
    release()
    await waitFor(() => expect(first).toBeEnabled())
  })

  it('reports a rejected access change and leaves permissions as they were', async () => {
    vi.spyOn(gateway, 'updateAiAccess').mockRejectedValueOnce(new Error('Simulated save failure'))
    renderAt('/connections/ai')
    await userEvent.click(await screen.findByRole('switch', { name: 'Send with my approval' }))
    expect(await screen.findByText('Simulated save failure')).toBeInTheDocument()
    expect(connections().ai.allowSend).toBe(false)
  })

  it('rejects a non-boolean permission at the gateway', async () => {
    await expect(gateway.updateAiAccess({ allowDrafts: 'false' as unknown as boolean })).rejects.toThrow('not valid')
    expect(connections().ai.allowDrafts).toBe(true)
  })

  it('drops unknown mailbox ids from the AI scope at the gateway', async () => {
    await gateway.updateAiAccess({ readMailboxIds: ['mbx-unknown', 'mbx-lachlan@boltloop.co', 'mbx-lachlan@boltloop.co'] })
    expect(connections().ai.readMailboxIds).toEqual(['mbx-lachlan@boltloop.co'])
  })

  it('offers no way to enter an enrichment key', async () => {
    renderAt('/connections/enrichment')
    expect(await screen.findByText('Hunter')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getAllByText('No key added')).toHaveLength(2)
  })

  it('states that root MX is protected for every domain', async () => {
    renderAt('/connections/domains')
    expect(await screen.findAllByText('Root MX protected')).toHaveLength(3)
    expect(screen.getByText('updates.boltloop.co')).toBeInTheDocument()
    expect(screen.queryByText(/cannot be managed/)).not.toBeInTheDocument()
    const panel = screen.getByRole('heading', { name: 'Sending domains' }).closest('div')!
    expect(within(panel).queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('AI Assistant', () => {
  it('prepares a simulated draft for a waiting conversation and never sends it', async () => {
    await gateway.updateAiAccess({ readMailboxIds: ['mbx-lachlan@boltloop.co'] })
    const sentBefore = useData.getState().events.filter((e) => e.kind === 'sent').length
    renderAt('/assistant')
    const list = screen.getByRole('list', { name: 'Conversations waiting for a reply' })
    const rows = within(list).getAllByRole('listitem')
    const prepare = vi.spyOn(gateway, 'prepareAiDraft')
    const draftIdsBefore = new Set(useData.getState().drafts.map((d) => d.id))
    await userEvent.click(within(rows[0]!).getByRole('button', { name: 'Prepare draft (simulated)' }))
    const review = await within(rows[0]!).findByRole('button', { name: 'Review draft' })
    const requested = prepare.mock.calls[0]![0]
    const created = useData.getState().drafts.filter((d) => !draftIdsBefore.has(d.id))
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ threadId: requested, identityId: 'lachlan@boltloop.co' })
    expect(created[0]!.body).toContain('Simulated draft')
    expect(useData.getState().events.filter((e) => e.kind === 'sent')).toHaveLength(sentBefore)
    // Review hands that exact draft to the composer; other rows still offer to prepare one.
    await userEvent.click(review)
    expect(openDraft).toHaveBeenCalledWith(created[0])
    expect(within(rows[1]!).getByRole('button', { name: 'Prepare draft (simulated)' })).toBeInTheDocument()
  })

  it('reports a failed preparation and creates no draft', async () => {
    await gateway.updateAiAccess({ readMailboxIds: ['mbx-lachlan@boltloop.co'] })
    vi.spyOn(gateway, 'prepareAiDraft').mockRejectedValueOnce(new Error('Simulated bridge failure'))
    const before = useData.getState().drafts.length
    renderAt('/assistant')
    const row = within(screen.getByRole('list', { name: 'Conversations waiting for a reply' })).getAllByRole('listitem')[0]!
    await userEvent.click(within(row).getByRole('button', { name: 'Prepare draft (simulated)' }))
    expect(await screen.findByText('Simulated bridge failure')).toBeInTheDocument()
    expect(useData.getState().drafts).toHaveLength(before)
    expect(within(row).getByRole('button', { name: 'Prepare draft (simulated)' })).toBeEnabled()
  })

  it('cannot prepare drafts while offline', async () => {
    await gateway.updateAiAccess({ readMailboxIds: ['mbx-lachlan@boltloop.co'] })
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderAt('/assistant')
    for (const button of screen.getAllByRole('button', { name: 'Prepare draft (simulated)' })) expect(button).toBeDisabled()
  })

  it('explains an empty scope and a drafting-off state instead of listing mail', async () => {
    await gateway.updateAiAccess({ readMailboxIds: [] })
    const view = renderAt('/assistant')
    expect(screen.getByRole('heading', { name: 'No mailboxes selected' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Conversations waiting for a reply' })).not.toBeInTheDocument()
    view.unmount()
    await gateway.updateAiAccess({ readMailboxIds: ['mbx-lachlan@boltloop.co'], allowDrafts: false })
    renderAt('/assistant')
    expect(screen.getByRole('heading', { name: 'Drafting is turned off' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Prepare draft (simulated)' })).not.toBeInTheDocument()
    await expect(gateway.prepareAiDraft(useData.getState().threads[0]!.id)).rejects.toThrow()
  })

  it('says so when nothing in scope is waiting', async () => {
    useData.setState({ threads: useData.getState().threads.map((t) => ({ ...t, folder: 'archive' as const })) })
    renderAt('/assistant')
    expect(screen.getByRole('heading', { name: 'Nothing is waiting' })).toBeInTheDocument()
  })
})
