// AIDEV-NOTE: exercise the grant form boundary independently of session fixtures and their mailbox count.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { CONNECTOR_GRANT_MAX_MAILBOXES, type ConnectorGrantCreateInput } from '@/data/connectorGrantsContract'
import { ConnectClientReference, GrantDialog } from './ConnectionsPage'

describe('Connection readiness regressions', () => {
  it.each([50, 51])('validates a selection of %i mailboxes before calling the gateway', async (count) => {
    const onCreate = vi.fn<(input: ConnectorGrantCreateInput) => Promise<string | null>>().mockResolvedValue(null)
    const mailboxes = Array.from({ length: count }, (_, index) => ({ id: `mailbox-${index}`, display_name: `Inbox ${index}` }))
    render(<GrantDialog open mailboxes={mailboxes} busy={false} onOpenChange={vi.fn()} onCreate={onCreate} />)
    fireEvent.change(screen.getByLabelText('Connection name'), { target: { value: 'Assistant' } })
    // AIDEV-NOTE: Batch the boundary fixture selection to avoid 50 separate jsdom dialog layout passes.
    const choices = screen.getAllByRole('checkbox')
    act(() => { for (const choice of choices) fireEvent.click(choice) })
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }))
    if (count > CONNECTOR_GRANT_MAX_MAILBOXES) {
      expect((await screen.findByRole('alert')).textContent).toContain('Choose at most 50 mailboxes per connection.')
      expect(onCreate).not.toHaveBeenCalled()
    } else {
      await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
      expect(onCreate.mock.calls[0]![0].mailboxes).toHaveLength(CONNECTOR_GRANT_MAX_MAILBOXES)
    }
  })

  it('labels setup as planned and distinguishes the secret from an API token', () => {
    render(<MemoryRouter><ConnectClientReference /></MemoryRouter>)
    expect(screen.getByText('Planned connector setup')).toBeTruthy()
    expect(screen.getByText(/The package names and commands are not published yet/)).toBeTruthy()
    expect(screen.getByText(/distinct from an api-user token/)).toBeTruthy()
    expect(screen.getByText(/Fixture grants are simulated/)).toBeTruthy()
    expect(screen.queryByText(/npm install/)).toBeNull()
    expect(screen.queryByText('Create an API token')).toBeNull()
  })
})
