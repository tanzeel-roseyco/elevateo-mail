import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MailboxHistoryControls } from './MailboxHistoryControls'

const mock = vi.hoisted(() => ({ load: vi.fn(), page: { after: null as string | null, items: [] as unknown[], next: null as { after: string } | null, status: 'idle', error: null as string | null } }))
vi.mock('@/data/http/instance', () => ({ live: { loadMailboxHistory: mock.load }, useLive: (selector: (state: { mailboxHistory: typeof mock.page }) => unknown) => selector({ mailboxHistory: mock.page }) }))
beforeEach(() => { mock.load.mockReset(); mock.page = { after: null, items: [], next: null, status: 'idle', error: null } })
// AIDEV-NOTE: Browsing history is explicit, loading blocks duplicate clicks, and errors expose retry.
it('opens history only on request and follows its server cursor', () => {
  mock.page = { after: null, items: [{}], next: { after: 'old' }, status: 'ready', error: null }
  render(<MailboxHistoryControls />)
  expect(mock.load).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Next archived mailboxes' }))
  expect(mock.load).toHaveBeenCalledWith('old')
  fireEvent.click(screen.getByRole('button', { name: 'Browse disconnected mailboxes' }))
  expect(mock.load).toHaveBeenLastCalledWith()
})
it('disables paging while loading', () => {
  mock.page.status = 'loading'
  render(<MailboxHistoryControls />)
  expect(screen.getByRole('button', { name: 'Browse disconnected mailboxes' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Next archived mailboxes' })).toBeDisabled()
})
it('retries the failed cursor without hiding the failure', () => {
  mock.page = { after: 'cursor', items: [], next: null, status: 'error', error: 'Offline' }
  render(<MailboxHistoryControls />)
  expect(screen.getByRole('status')).toHaveTextContent('Offline')
  fireEvent.click(screen.getByRole('button', { name: 'Retry history' }))
  expect(mock.load).toHaveBeenCalledWith('cursor')
})
