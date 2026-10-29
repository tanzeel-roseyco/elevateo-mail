import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '@/app/session'
import { GatewayError } from '@/data/errors'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import type { SendStatus } from '@/data/sendContract'
import { SendStatusPage } from './SendStatusPage'
import { STATUS } from './sendTestData'

function setup(status: SendStatus, result: 'cancelled' | 'stop_requested' = 'stop_requested', fail = false) {
  const g = {
    ...createFixtureGateway(), getSendStatus: vi.fn(async () => status),
    cancelSend: vi.fn(async () => {
      if (fail) throw new GatewayError('transport', 'timeout', 'synthetic')
      return { context_id: CD.contextId, authorization_version: CD.authorizationVersion, send_id: status.send_id, result, state: status.state, cancel_requested: true as const, simulated: true as const }
    }),
  }
  render(<SessionProvider gateway={g}><MemoryRouter initialEntries={[`/mailboxes/${CD.mailboxId}/send-intents/${status.send_id}`]}><Routes><Route path="/mailboxes/:mailboxId/send-intents/:sendId" element={<SendStatusPage />} /></Routes></MemoryRouter></SessionProvider>)
  return g
}
describe('BE03 simulated status', () => {
  it('shows known pre-dispatch cancellation and refreshes authoritative status', async () => {
    const g = setup(STATUS, 'cancelled')
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel before dispatch' }))
    await screen.findByText('Cancellation confirmed before dispatch authorization.')
    expect(g.cancelSend).toHaveBeenCalledWith(expect.anything(), expect.anything(), STATUS.send_id, { mailbox_id: CD.mailboxId }, expect.any(AbortSignal))
    expect(g.getSendStatus).toHaveBeenCalledTimes(2)
  })
  it('describes a late stop as uncertain, never as safely cancelled', async () => {
    setup({ ...STATUS, state: 'unknown', cancellable: false, attempts: 1, first_possible_at: STATUS.approved_at })
    fireEvent.click(await screen.findByRole('button', { name: 'Request stop' }))
    await screen.findByText(/this does not prove cancellation/)
    expect(screen.getByText(/Do not resend/)).not.toBeNull()
  })
  it('offers idempotent stop retry after lost response without enabling resend', async () => {
    setup(STATUS, 'stop_requested', true)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel before dispatch' }))
    await screen.findByText(/stop request was not confirmed/)
    expect((screen.getByRole('button', { name: 'Cancel before dispatch' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('never labels simulated acceptance as delivery or offers cancellation', async () => {
    setup({ ...STATUS, state: 'accepted', cancellable: false, attempts: 1 })
    await screen.findByRole('heading', { name: 'Send intent: accepted' })
    expect(screen.getByText(/Acceptance does not establish delivery/)).not.toBeNull()
    expect(screen.queryByRole('button', { name: /Cancel|Request stop/ })).toBeNull()
  })
  it('shows delivery evidence separately from provider acceptance', async () => {
    setup({ ...STATUS, state: 'accepted', simulated: false, cancellable: false, delivery_status: 'delivered', delivery_updated_at: STATUS.approved_at })
    await screen.findByRole('heading', { name: 'Delivery: delivered' })
    expect(screen.getByText(/does not confirm the email was read/)).not.toBeNull()
    expect(screen.getByText('Live email')).not.toBeNull()
  })
  it.each([['bounced', /after a bounce/], ['complained', /after a spam complaint/]] as const)('shows the %s provider state and its suppression reason on a live send', async (state, reason) => {
    setup({ ...STATUS, state: 'accepted', simulated: false, cancellable: false, delivery_status: state, delivery_updated_at: STATUS.approved_at, suppression_reason: state })
    await screen.findByRole('heading', { name: `Delivery: ${state}` })
    expect(screen.getByRole('note', { name: 'Suppression' }).textContent).toMatch(reason)
    expect(screen.queryByText(/Simulated/)).toBeNull()
  })
  it('shows delivery delays without a suppression reason', async () => {
    setup({ ...STATUS, state: 'accepted', simulated: false, cancellable: false, delivery_status: 'delivery_delayed', delivery_updated_at: STATUS.approved_at })
    await screen.findByRole('heading', { name: 'Delivery: delivery delayed' })
    expect(screen.queryByRole('note', { name: 'Suppression' })).toBeNull()
  })
  it('keeps the simulated label on simulated sends', async () => {
    setup(STATUS)
    await screen.findByRole('heading', { name: 'Send intent: queued' })
    expect(screen.getByText('Simulated - no live mail')).not.toBeNull()
    expect(screen.getByText(/Simulated attempts/)).not.toBeNull()
  })
  it('does not present a foreign mailbox status as this intent', async () => {
    setup({ ...STATUS, mailbox_id: STATUS.send_id })
    await screen.findByText(/This send status is unavailable/)
    expect(screen.queryByText(/durably queued/)).toBeNull()
  })
})

// Polling with bounded backoff: a non-terminal status re-checks on a timer, a terminal status stops,
// and a failed poll stops the automatic schedule while leaving the manual refresh in place.
describe('BE03 status polling', () => {
  const flush = () => act(async () => {})
  afterEach(() => vi.useRealTimers())

  function renderStatus(getSendStatus: () => Promise<SendStatus>) {
    const g = { ...createFixtureGateway(), getSendStatus: vi.fn(getSendStatus) }
    render(<SessionProvider gateway={g}><MemoryRouter initialEntries={[`/mailboxes/${CD.mailboxId}/send-intents/${STATUS.send_id}`]}><Routes><Route path="/mailboxes/:mailboxId/send-intents/:sendId" element={<SendStatusPage />} /></Routes></MemoryRouter></SessionProvider>)
    return g
  }

  it('re-checks a pending send and stops once the status is terminal', async () => {
    vi.useFakeTimers()
    const delivered: SendStatus = { ...STATUS, state: 'accepted', cancellable: false, attempts: 1, delivery_status: 'delivered', delivery_updated_at: STATUS.approved_at }
    const queue = [STATUS, delivered]
    let i = 0
    const g = renderStatus(async () => queue[Math.min(i++, queue.length - 1)]!)
    await flush()
    expect(g.getSendStatus).toHaveBeenCalledTimes(1) // initial load: queued (non-terminal)
    await act(async () => { vi.advanceTimersByTime(4000) })
    await flush()
    expect(g.getSendStatus).toHaveBeenCalledTimes(2) // first poll: delivered (terminal)
    await act(async () => { vi.advanceTimersByTime(20_000) })
    await flush()
    expect(g.getSendStatus).toHaveBeenCalledTimes(2) // no further polls after a terminal status
  })

  it('stops automatic polling when a poll fails and keeps the manual refresh working', async () => {
    vi.useFakeTimers()
    let calls = 0
    const g = renderStatus(async () => {
      calls += 1
      if (calls >= 2) throw new GatewayError('transport', 'timeout', 'synthetic')
      return STATUS
    })
    await flush()
    expect(g.getSendStatus).toHaveBeenCalledTimes(1)
    await act(async () => { vi.advanceTimersByTime(4000) })
    await flush()
    expect(g.getSendStatus).toHaveBeenCalledTimes(2) // poll failed -> schedule stops
    await act(async () => { vi.advanceTimersByTime(20_000) })
    await flush()
    expect(g.getSendStatus).toHaveBeenCalledTimes(2) // no more automatic polls
    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
    await flush()
    expect(g.getSendStatus).toHaveBeenCalledTimes(3) // manual refresh still issues a request
    expect(screen.getByText(/This send status is unavailable/)).toBeTruthy()
  })
})
