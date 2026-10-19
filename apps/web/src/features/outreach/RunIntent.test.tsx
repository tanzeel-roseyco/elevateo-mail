import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SessionProvider, useSession } from '@/app/session'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { RunIntentProvider, useRunIntent } from './RunIntent'

const id = '00000000-0000-4000-8000-000000000001'
const attempt = { input: { operation_id: id, expected_campaign_version: 1, mailbox_id: id, subject: 'Original', body_text: 'Original body', marketing_confirmed: true as const, lead_ids: [id] }, runId: null }
function Probe() {
  const intent = useRunIntent()
  const { state, signOut } = useSession()
  const [value, setValue] = useState(() => intent.read(id))
  return <><button disabled={state.status !== 'ready'} onClick={() => { intent.save(id, attempt); setValue(intent.read(id)) }}>Save attempt</button>
    <button onClick={() => { void signOut('local') }}>Sign out</button><button onClick={() => setValue(intent.read(id))}>Read attempt</button>
    <p>{value?.input.subject ?? 'No attempt'}</p></>
}
function Workspace() {
  const [visible, setVisible] = useState(true)
  return <><button onClick={() => setVisible((value) => !value)}>Navigate</button>{visible && <Probe />}</>
}
// AIDEV-NOTE: Uncertain operations survive route replacement, but must never survive an explicit sign-out.
describe('marketing run session ownership', () => {
  it('retains the exact submitted intent across route remount and warns before tab close', async () => {
    render(<SessionProvider gateway={createFixtureGateway()}><RunIntentProvider><Workspace /></RunIntentProvider></SessionProvider>)
    const save = await screen.findByRole('button', { name: 'Save attempt' })
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(save)
    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }))
    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }))
    expect(screen.getByText('Original')).toBeTruthy()
    const close = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(close)
    expect(close.defaultPrevented).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Read attempt' }))
    expect(screen.getByText('No attempt')).toBeTruthy()
  })
})
