// The session provider exposes state and actions through separate contexts: an actions-only
// consumer renders once for the life of the provider while state consumers follow every transition.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { SessionProvider, useSession, useSessionActions, type SessionActions } from './session'

afterEach(cleanup)

describe('session context split', () => {
  it('does not re-render an actions-only consumer when the session state changes', async () => {
    const seen: SessionActions[] = []
    let stateRenders = 0
    function ActionsOnly() {
      seen.push(useSessionActions())
      return <p>actions ready</p>
    }
    function StateProbe() {
      stateRenders += 1
      return <p>status:{useSession().state.status}</p>
    }
    render(
      <SessionProvider gateway={createFixtureGateway()}>
        <ActionsOnly />
        <StateProbe />
      </SessionProvider>,
    )
    expect(screen.getByText('status:loading')).toBeTruthy()
    await screen.findByText('status:ready')
    expect(stateRenders).toBeGreaterThanOrEqual(2)
    expect(seen).toHaveLength(1)

    // An explicit retry cycles loading -> ready again; the actions object keeps its identity.
    await act(async () => { seen[0]?.refresh() })
    await screen.findByText('status:ready')
    expect(seen).toHaveLength(1)
    expect(typeof seen[0]?.handleError).toBe('function')
  })

  it('useSession keeps returning state and actions together', async () => {
    function Combined() {
      const { state, scope, refresh, signOut } = useSession()
      return <p>{state.status}:{typeof scope.current()}:{typeof refresh}:{typeof signOut}</p>
    }
    render(<SessionProvider gateway={createFixtureGateway()}><Combined /></SessionProvider>)
    await screen.findByText('ready:number:function:function')
  })
})
