import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { ServerMailbox } from '@/data/http/contract'
import { LiveConnectionsPage } from './LiveConnectionsPage'

const state = vi.hoisted(() => ({ mailboxes: [] as ServerMailbox[], quotas: {}, capabilities: null,
  setPermissions: vi.fn(), refresh: vi.fn(), quota: vi.fn(), confirm: vi.fn() }))
vi.mock('@/data/http/instance', () => ({
  useLive: (select: (value: typeof state) => unknown) => select(state),
  live: { setPermissions: state.setPermissions, refreshMailboxes: state.refresh, loadQuota: state.quota },
}))
vi.mock('./MessageImport', () => ({ MessageImport: () => null }))
vi.mock('./ConnectionGrants', () => ({ ConnectionGrants: () => null }))
vi.mock('./GmailConnection', () => ({ GmailConnection: () => null, GmailSyncButton: () => null }))
// AIDEV-NOTE: Provider panels have dedicated tests; this suite isolates mailbox permission controls.
vi.mock('./GmailSending', () => ({ GmailSending: () => <p>Verified Gmail sending controls</p> }))
vi.mock('./ResendConnection', () => ({ ResendConnection: () => null }))
vi.mock('./HunterConnection', () => ({ HunterConnection: () => null }))
vi.mock('./MailboxHistoryControls', () => ({ MailboxHistoryControls: () => null }))
vi.mock('@/ui/confirm', () => ({ confirm: state.confirm }))
const mailbox: ServerMailbox = { id: 'gmail', address: 'person@example.com', provider: 'gmail',
  connected: true, sendEnabled: false, aiRead: true, aiDraft: true, aiSend: false }
beforeEach(() => {
  vi.resetAllMocks(); state.mailboxes = [{ ...mailbox }]
  state.refresh.mockResolvedValue(undefined); state.setPermissions.mockResolvedValue(undefined)
  state.confirm.mockResolvedValue(true)
})
function show(section: string) {
  return render(<MemoryRouter initialEntries={[`/connections/${section}`]}><Routes>
    <Route path="/connections/:section" element={<LiveConnectionsPage />} />
  </Routes></MemoryRouter>)
}
it('disconnects a real mailbox with all access flags removed and keeps sending disabled', async () => {
  show('mailboxes')
  expect(screen.queryByRole('switch', { name: 'Allow sending from this mailbox' })).not.toBeInTheDocument()
  expect(screen.getByText('Verified Gmail sending controls')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
  await waitFor(() => expect(state.setPermissions).toHaveBeenCalledWith('gmail', {
    connected: false, sendEnabled: false, aiRead: false, aiDraft: false, aiSend: false,
  }))
})
it('prevents generic reconnect and directs real mailboxes to verified setup', () => {
  state.mailboxes[0]!.connected = false
  show('mailboxes')
  expect(screen.getByRole('button', { name: 'Reconnect' })).toBeDisabled()
  expect(screen.getByText(/Reconnect Gmail through/u)).toBeInTheDocument()
})
it('disables generic AI permission controls for real mailboxes', () => {
  show('ai')
  for (const control of screen.getAllByRole('switch')) expect(control).toBeDisabled()
  expect(screen.getByText('Manage real mailbox AI read and draft access through its verified stored connection. AI sending remains disabled.')).toBeInTheDocument()
})
it('preserves simulated mailbox permission controls', () => {
  state.mailboxes[0]!.provider = 'fake'
  show('ai')
  for (const control of screen.getAllByRole('switch')) expect(control).toBeEnabled()
})
