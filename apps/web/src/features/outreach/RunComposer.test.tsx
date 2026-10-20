import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '@/app/session'
import { MailboxesProvider } from '@/app/mailboxes'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { createV2OutreachGateway } from '@/data/v2OutreachGateway'
import { GatewayError } from '@/data/errors'
import { RunIntentProvider } from './RunIntent'
import { RunComposer } from './RunComposer'
import { campaignRunInputSchema, type CampaignRunInput } from './runContract'
import type { OutreachGateway } from './contract'

const id = '00000000-0000-4000-8000-000000000001'
const lead = '00000000-0000-4000-8000-000000000002'
const saved = (input: CampaignRunInput) => ({ id, campaign_id: id, mailbox_id: id, operation_id: input.operation_id, state: 'queued', subject: input.subject, body_text: input.body_text,
  created_at: '2026-10-20T00:00:00Z', simulated: true, recipients: [{ lead_id: lead, email: 'lead@example.test', draft_id: id, send_id: id, state: 'queued', delivery_state: null }] })
function mount(createCampaignRun: NonNullable<OutreachGateway['createCampaignRun']>) {
  const onCreated = vi.fn()
  render(<SessionProvider gateway={createFixtureGateway()}><RunIntentProvider><MailboxesProvider value={{ status: 'ready', mailboxes: [{ id, display_name: 'Sender', display_address: null, capabilities: { read: true, compose: true, approve_send: true, manage_members: false } }] }}>
    <RunComposer gateway={{ ...createV2OutreachGateway(), createCampaignRun }} campaign={{ id, name: 'Newsletter', status: 'draft', version: 1 }} leads={[
      { id: lead, campaign_id: id, email: 'lead@example.test', consent_status: 'granted', suppressed: false, version: 1 },
      { id, campaign_id: id, email: 'blocked@example.test', consent_status: 'unknown', suppressed: true, version: 1 },
    ]} onCreated={onCreated} />
  </MailboxesProvider></RunIntentProvider></SessionProvider>)
  return onCreated
}
async function fill() {
  await waitFor(() => expect((screen.getByRole('button', { name: 'Queue marketing run' }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.change(screen.getByLabelText('Sending account'), { target: { value: id } })
  fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Newsletter' } })
  fireEvent.change(screen.getByLabelText('Plain-text message'), { target: { value: 'Your opted-in newsletter. Reply unsubscribe to opt out.' } })
  fireEvent.click(screen.getByLabelText('lead@example.test · granted'))
  fireEvent.click(screen.getByLabelText(/I confirm these recipients/))
}
describe('bounded marketing run composer', () => {
  it('queues only selected opted-in leads with explicit confirmation', async () => {
    const create = vi.fn(async (_context: unknown, _proof: unknown, _campaign: unknown, input: CampaignRunInput) => { void _context; void _proof; void _campaign; return saved(input) })
    const onCreated = mount(create)
    await fill()
    expect((screen.getByLabelText('blocked@example.test · suppressed') as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Queue marketing run' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0]?.[3]).toMatchObject({ lead_ids: [lead], marketing_confirmed: true, expected_campaign_version: 1 })
    expect(screen.getByRole('button', { name: 'Prepare another run' })).toBeTruthy()
  })
  it('replays the exact operation and message after a lost or malformed receipt', async () => {
    let calls = 0
    const create = vi.fn(async (_context: unknown, _proof: unknown, _campaign: unknown, input: CampaignRunInput) => {
      void _context; void _proof; void _campaign
      if (++calls === 1) throw new GatewayError('transport', 'malformed', 'Lost receipt')
      return saved(input)
    })
    mount(create); await fill()
    fireEvent.click(screen.getByRole('button', { name: 'Queue marketing run' }))
    await screen.findByRole('button', { name: 'Retry original run' })
    expect((screen.getByLabelText('Subject') as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Retry original run' }))
    await screen.findByRole('button', { name: 'Prepare another run' })
    expect(create.mock.calls[1]?.[3]).toEqual(create.mock.calls[0]?.[3])
  })
  it.each([new Error('Receipt mismatch'), { invalid: 'receipt' }])('preserves original input after invalid response %s', async (failure) => {
    let calls = 0
    const create = vi.fn<NonNullable<OutreachGateway['createCampaignRun']>>(async (_context, _proof, _campaign, input) => {
      void _context; void _proof; void _campaign
      if (++calls === 1) { if (failure instanceof Error) throw failure; return failure }
      return saved(input)
    })
    mount(create); await fill()
    fireEvent.click(screen.getByRole('button', { name: 'Queue marketing run' }))
    await screen.findByRole('button', { name: 'Retry original run' })
    fireEvent.click(screen.getByRole('button', { name: 'Retry original run' }))
    await screen.findByRole('button', { name: 'Prepare another run' })
    expect(create.mock.calls[1]?.[3]).toEqual(create.mock.calls[0]?.[3])
  })
  it('rejects empty audiences and missing confirmation without dispatch', async () => {
    const create = vi.fn(async (_context: unknown, _proof: unknown, _campaign: unknown, input: CampaignRunInput) => { void _context; void _proof; void _campaign; return saved(input) })
    mount(create)
    await waitFor(() => expect((screen.getByRole('button', { name: 'Queue marketing run' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Queue marketing run' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })
  it('bounds unique audiences and UTF-8 body bytes', () => {
    const input = { operation_id: id, expected_campaign_version: 1, mailbox_id: id, subject: 'News', body_text: 'Hello', marketing_confirmed: true, lead_ids: [lead] }
    expect(campaignRunInputSchema.safeParse(input).success).toBe(true)
    expect(campaignRunInputSchema.safeParse({ ...input, lead_ids: [lead, lead] }).success).toBe(false)
    expect(campaignRunInputSchema.safeParse({ ...input, body_text: '界'.repeat(22_000) }).success).toBe(false)
    expect(campaignRunInputSchema.safeParse({ ...input, subject: '\u754c'.repeat(333) }).success).toBe(false)
    expect(campaignRunInputSchema.safeParse({ ...input, subject: '   ' }).success).toBe(false)
    expect(campaignRunInputSchema.safeParse({ ...input, body_text: '\t \n' }).success).toBe(false)
    expect(campaignRunInputSchema.safeParse({ ...input, subject: 'Injected\r\nBcc: x@example.test' }).success).toBe(false)
  })
})
