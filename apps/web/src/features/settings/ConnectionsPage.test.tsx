// Connections screen (Settings › Integrations › Connections): the list renders with the external-AI
// sharing notice, granting shows the one-time secret once, a failed revoke surfaces an error while
// leaving the connection listed, and a failed list load offers a retry. The grant data comes through
// an in-test ConnectorGrantsGateway fake so no network or real client is involved.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { GatewayError } from '@/data/errors'
import { SessionProvider } from '@/app/session'
import { Shell } from '@/app/Shell'
import { FeatureGatewaysProvider } from '@/app/featureGateways'
import type { ConnectorGrant, ConnectorGrantsGateway } from '@/data/connectorGrantsContract'
import { SettingsRoutes } from './SettingsRoutes'

const GRANT: ConnectorGrant = {
  id: '11111111-1111-4111-8111-111111111111',
  client_name: 'Claude Desktop',
  client_kind: 'claude',
  created_at: '2026-10-20T09:00:00Z',
  last_used_at: null,
  expires_at: null,
  mailboxes: [{ mailbox_id: '33333333-3333-4333-8333-333333333333', display_name: 'Growth inbox', scopes: ['mailbox:read'] }],
}

/** A controllable gateway: each method defaults to a benign success and can be overridden per test. */
function fakeGateway(overrides: Partial<ConnectorGrantsGateway> = {}): ConnectorGrantsGateway {
  return {
    listConnectorGrants: async () => ({ items: [] }),
    createConnectorGrant: async (_ctx, _proof, input) => ({
      grant: { ...GRANT, id: 'created', client_name: input.client_name, mailboxes: input.mailboxes.map((m) => ({ mailbox_id: m.mailbox_id, display_name: 'C/D fixture mailbox', scopes: m.scopes })) },
      secret: 'elv_mcp_SECRET_SHOWN_ONCE',
    }),
    revokeConnectorGrant: async () => undefined,
    removeConnectorGrantMailbox: async (_ctx, _proof, _grantId, mailboxId) => ({ ...GRANT, mailboxes: GRANT.mailboxes.filter((m) => m.mailbox_id !== mailboxId) }),
    ...overrides,
  }
}

function renderConnections(connectorGrants: ConnectorGrantsGateway) {
  return render(
    <SessionProvider gateway={createFixtureGateway()}>
      <FeatureGatewaysProvider value={{ connectorGrants }}>
        <MemoryRouter initialEntries={['/settings/integrations/mcp']}>
          <Routes>
            <Route element={<Shell />}>
              <Route path="/settings/*" element={<SettingsRoutes />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </FeatureGatewaysProvider>
    </SessionProvider>,
  )
}

describe('Connections screen', () => {
  it('ignores an older list response after a grant reload has completed', async () => {
    let resolveOlder!: (value: { items: ConnectorGrant[] }) => void
    const older = new Promise<{ items: ConnectorGrant[] }>((resolve) => { resolveOlder = resolve })
    const current = { ...GRANT, client_name: 'New connection' }
    const list = vi.fn<ConnectorGrantsGateway['listConnectorGrants']>()
      .mockImplementationOnce(() => older)
      .mockResolvedValue({ items: [current] })
    renderConnections(fakeGateway({ listConnectorGrants: list }))
    const grant = await screen.findByRole('button', { name: 'Grant access' })
    await waitFor(() => expect((grant as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(grant)
    const dialog = await screen.findByRole('dialog', { name: 'Grant a connection' })
    fireEvent.change(within(dialog).getByLabelText('Connection name'), { target: { value: 'New connection' } })
    fireEvent.click(within(dialog).getByLabelText('C/D fixture mailbox'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Grant access' }))
    await screen.findByRole('dialog', { name: 'Copy the connection secret' })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New connection', hidden: true })).toBeTruthy())
    // AIDEV-NOTE: the older pre-write snapshot must not erase a newly granted connection.
    await act(async () => { resolveOlder({ items: [] }); await older })
    expect(screen.getByRole('heading', { name: 'New connection', hidden: true })).toBeTruthy()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('lists each connection with the external-AI sharing notice (happy path)', async () => {
    renderConnections(fakeGateway({ listConnectorGrants: async () => ({ items: [GRANT] }) }))
    // The connection and its client kind are shown, flagged as an external AI.
    expect(await screen.findByRole('heading', { name: 'Claude Desktop' })).toBeTruthy()
    expect(screen.getByText('External AI')).toBeTruthy()
    // The exact per-mailbox sharing sentence names the mailbox and the client.
    expect(screen.getByText('Mail in Growth inbox can be read by Claude Desktop (external AI). Content is sent to that AI provider when it reads.')).toBeTruthy()
    expect(screen.getByText('Read mail')).toBeTruthy()
  })

  it('shows the one-time secret exactly once after granting (happy path)', async () => {
    const create = vi.fn(fakeGateway().createConnectorGrant)
    renderConnections(fakeGateway({ createConnectorGrant: create }))
    // Grant stays disabled until the mailbox list has loaded; wait for it before opening the dialog.
    const grant = await screen.findByRole('button', { name: 'Grant access' })
    await waitFor(() => expect((grant as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(grant)
    const dialog = await screen.findByRole('dialog', { name: 'Grant a connection' })
    fireEvent.change(within(dialog).getByLabelText('Connection name'), { target: { value: 'Codex on laptop' } })
    // Pick a mailbox the fixture reports; read is granted by default (no draft:write unless opted in).
    fireEvent.click(within(dialog).getByLabelText('C/D fixture mailbox'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Grant access' }))
    const secretDialog = await screen.findByRole('dialog', { name: 'Copy the connection secret' })
    expect(within(secretDialog).getByText('elv_mcp_SECRET_SHOWN_ONCE')).toBeTruthy()
    expect(within(secretDialog).getByText(/only time the secret is shown/i)).toBeTruthy()
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]![2].mailboxes).toEqual([{ mailbox_id: expect.any(String), scopes: ['mailbox:read'] }])
  })

  it('keeps the connection listed and shows an error when a revoke fails (failure path)', async () => {
    const revoke = vi.fn(async () => {
      throw new GatewayError('api', 'temporarily_unavailable', 'synthetic', { status: 503 })
    })
    renderConnections(fakeGateway({ listConnectorGrants: async () => ({ items: [GRANT] }), revokeConnectorGrant: revoke }))
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }))
    const confirm = await screen.findByRole('dialog', { name: 'Revoke this connection?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Revoke connection' }))
    // The failure is announced and the connection is still on screen (nothing was removed).
    await waitFor(() => expect(screen.getByText(/temporarily unavailable/i)).toBeTruthy())
    expect(screen.getByRole('heading', { name: 'Claude Desktop' })).toBeTruthy()
    expect(revoke).toHaveBeenCalledTimes(1)
  })

  it('offers a retry when the connection list fails to load (failure path)', async () => {
    let attempts = 0
    const list = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) throw new GatewayError('api', 'temporarily_unavailable', 'synthetic', { status: 503 })
      return { items: [GRANT] }
    })
    renderConnections(fakeGateway({ listConnectorGrants: list }))
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Claude Desktop' })).toBeTruthy()
    expect(list).toHaveBeenCalledTimes(2)
  })
})
