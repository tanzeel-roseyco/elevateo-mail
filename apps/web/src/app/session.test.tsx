// R3: delayed responses cannot populate a new context; a current 401 clears session state; a
// context_changed re-bootstraps exactly once before requiring explicit retry.
import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { GatewayError } from '@/data/errors'
import type { MailroomGateway } from '@/data/gateway'
import { SessionProvider, useSession, type SessionController } from './session'

function Probe({ grab }: { grab: (controller: SessionController) => void }) {
  const controller = useSession()
  grab(controller)
  return <p>status:{controller.state.status}</p>
}

function renderSession(gateway: MailroomGateway) {
  let latest: SessionController | undefined
  render(
    <SessionProvider gateway={gateway}>
      <Probe grab={(c) => (latest = c)} />
    </SessionProvider>,
  )
  return { controller: () => latest! }
}

const apiError = (code: 'unauthenticated' | 'context_changed') => new GatewayError('api', code, 'synthetic', { status: 401, requestId: 'r1' })

describe('SessionProvider', () => {
  it('bootstraps to ready with the fixture session', async () => {
    renderSession(createFixtureGateway())
    await screen.findByText('status:ready')
  })

  it('an unauthenticated bootstrap shows the session-unavailable state', async () => {
    renderSession(createFixtureGateway({ getSession: 'unauthenticated' }))
    await screen.findByText('status:unauthenticated')
  })

  it('a current 401 from any read clears the session; a stale 401 is ignored', async () => {
    const { controller } = renderSession(createFixtureGateway())
    await screen.findByText('status:ready')
    // Stale: error captured under an old generation must not clear the newer session (R3).
    const oldGeneration = controller().scope.current()
    controller().scope.invalidate()
    act(() => {
      expect(controller().handleError(apiError('unauthenticated'), oldGeneration)).toBe(true)
    })
    expect(screen.getByText('status:ready')).toBeTruthy()
    // Current: the same error under the live generation clears the session.
    act(() => {
      expect(controller().handleError(apiError('unauthenticated'), controller().scope.current())).toBe(true)
    })
    await screen.findByText('status:unauthenticated')
    expect(controller().context).toBeNull()
  })

  it('context_changed re-bootstraps once, then demands explicit retry', async () => {
    let sessionCalls = 0
    const fixture = createFixtureGateway()
    const gateway: MailroomGateway = {
      ...fixture,
      getSession: (signal) => {
        sessionCalls += 1
        return fixture.getSession(signal)
      },
    }
    const { controller } = renderSession(gateway)
    await screen.findByText('status:ready')
    expect(sessionCalls).toBe(1)

    act(() => {
      expect(controller().handleError(apiError('context_changed'), controller().scope.current())).toBe(true)
    })
    await screen.findByText('status:ready')
    expect(sessionCalls).toBe(2) // exactly one automatic re-bootstrap

    act(() => {
      expect(controller().handleError(apiError('context_changed'), controller().scope.current())).toBe(true)
    })
    await screen.findByText('status:error')
    expect(sessionCalls).toBe(2) // no automatic loop; explicit retry required

    act(() => controller().refresh())
    await screen.findByText('status:ready')
    expect(sessionCalls).toBe(3)
  })

  it('other API errors are left to the page', async () => {
    const { controller } = renderSession(createFixtureGateway())
    await screen.findByText('status:ready')
    const unhandled = new GatewayError('api', 'rate_limited', 'synthetic', { status: 429, requestId: 'r1' })
    expect(controller().handleError(unhandled, controller().scope.current())).toBe(false)
    expect(screen.getByText('status:ready')).toBeTruthy()
  })
})
