// BE-02A lifecycle behaviour of the session controller: one bounded challenge+refresh after a
// 401 (renewed only by a successful ordinary session result), explicit sign-in/recovery/sign-out
// and organization switch, no-organization as an explicit state, fenced protected state and
// superseded late results (success AND failure) that cannot touch a newer attempt.
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { GatewayError } from '@/data/errors'
import type { MailroomGateway } from '@/data/gateway'
import type { ActionResult } from './actionFailure'
import { SessionProvider, useSession, type SessionController } from './session'

function Probe({ grab }: { grab: (controller: SessionController) => void }) {
  const controller = useSession()
  grab(controller)
  const { state } = controller
  return (
    <>
      <p>status:{state.status}</p>
      {state.status === 'ready' && <p>actor:{state.session.actor.display_name}</p>}
      {state.status === 'ready' && <p>org:{state.session.organization.name}</p>}
      {state.status === 'unauthenticated' && <p>notice:{state.notice === null ? 'none' : state.notice.kind === 'signed_out' ? `signed_out:${state.notice.upstream}` : state.notice.kind}</p>}
    </>
  )
}

function renderSession(gateway: MailroomGateway) {
  let latest: SessionController | undefined
  const view = render(
    <SessionProvider gateway={gateway}>
      <Probe grab={(c) => (latest = c)} />
    </SessionProvider>,
  )
  return { controller: () => latest!, unmount: view.unmount }
}

const flush = () => act(async () => {})
const apiError = (code: 'unauthenticated' | 'not_available' | 'temporarily_unavailable' | 'rate_limited' | 'context_changed' | 'request_invalid', status: number) =>
  new GatewayError('api', code, 'synthetic', { status, requestId: 'r1' })

/**
 * Counts lifecycle calls on top of the fixture gateway; each counter is per operation.
 * Overrides are applied to the base BEFORE wrapping so an overridden operation is still counted.
 */
function counting(overrides: Partial<MailroomGateway> = {}) {
  const base: MailroomGateway = { ...createFixtureGateway(), ...overrides }
  const calls = { session: 0, challenge: 0, refresh: 0, login: 0, logout: 0, switch: 0, recovery: 0 }
  const gateway: MailroomGateway = {
    ...base,
    getSession: (signal) => {
      calls.session += 1
      return base.getSession(signal)
    },
    getLoginChallenge: (signal) => {
      calls.challenge += 1
      return base.getLoginChallenge(signal)
    },
    refreshSession: (proof, signal) => {
      calls.refresh += 1
      return base.refreshSession(proof, signal)
    },
    login: (proof, input, signal) => {
      calls.login += 1
      return base.login(proof, input, signal)
    },
    logout: (proof, input, signal) => {
      calls.logout += 1
      return base.logout(proof, input, signal)
    },
    switchOrganization: (ctx, proof, input, signal) => {
      calls.switch += 1
      return base.switchOrganization(ctx, proof, input, signal)
    },
    requestRecovery: (proof, input, signal) => {
      calls.recovery += 1
      return base.requestRecovery(proof, input, signal)
    },
  }
  return { gateway, calls }
}

afterEach(() => vi.restoreAllMocks())

describe('bounded refresh after a 401', () => {
  it('a 401 bootstrap attempts exactly one challenge+refresh, then lands on sign-in when it fails', async () => {
    const { gateway, calls } = counting({ getSession: async () => { throw apiError('unauthenticated', 401) } })
    renderSession(gateway)
    await screen.findByText('status:unauthenticated')
    expect(calls.challenge).toBe(1)
    expect(calls.refresh).toBe(1)
    expect(screen.getByText('notice:session_ended')).toBeTruthy()
  })

  it('a successful refresh replaces the session and restarts reads without a second session read', async () => {
    const { gateway, calls } = counting({
      getSession: async () => { throw apiError('unauthenticated', 401) },
      refreshSession: async () => createFixtureGateway({ refreshSession: 'lifecycle_b' }).refreshSession({ csrfToken: 'x'.repeat(16) }),
    })
    const { controller } = renderSession(gateway)
    await screen.findByText('status:ready')
    expect(screen.getByText('actor:Fixture user B')).toBeTruthy()
    expect(calls.session).toBe(1)
    expect(calls.refresh).toBe(1)
    expect(controller().context?.contextId).toBe('context_B_0123456789')
  })

  it('protected content is fenced during the refresh: the refreshing state has no context', async () => {
    let release!: () => void
    const { gateway } = counting({
      getSession: async () => { throw apiError('unauthenticated', 401) },
      refreshSession: async () => {
        await new Promise<void>((resolve) => (release = resolve))
        throw apiError('unauthenticated', 401)
      },
    })
    const { controller } = renderSession(gateway)
    await screen.findByText('status:refreshing')
    expect(controller().context).toBeNull()
    act(() => release())
    await screen.findByText('status:unauthenticated')
  })

  it('a refreshed session whose next read still 401s goes to sign-in instead of refreshing again', async () => {
    let sessionCalls = 0
    const { gateway, calls } = counting({
      getSession: async () => {
        sessionCalls += 1
        throw apiError('unauthenticated', 401)
      },
      refreshSession: async () => createFixtureGateway({ refreshSession: 'lifecycle_a' }).refreshSession({ csrfToken: 'x'.repeat(16) }),
    })
    const { controller } = renderSession(gateway)
    await screen.findByText('status:ready')
    expect(calls.refresh).toBe(1)
    // A protected read reports a current 401: the allowance is spent, so no second refresh.
    act(() => {
      controller().handleError(apiError('unauthenticated', 401), controller().scope.current())
    })
    await screen.findByText('status:unauthenticated')
    expect(calls.refresh).toBe(1)
    expect(sessionCalls).toBe(1)
  })

  it('a successful ordinary session read renews the single refresh allowance', async () => {
    const { gateway, calls } = counting({
      refreshSession: async () => createFixtureGateway({ refreshSession: 'lifecycle_a' }).refreshSession({ csrfToken: 'x'.repeat(16) }),
    })
    const { controller } = renderSession(gateway)
    await screen.findByText('status:ready')
    act(() => {
      controller().handleError(apiError('unauthenticated', 401), controller().scope.current())
    })
    await screen.findByText('status:ready')
    expect(calls.refresh).toBe(1)
    // Explicit retry performs an ordinary session read that succeeds: the next 401 may refresh once more.
    act(() => controller().refresh())
    await screen.findByText('status:ready')
    act(() => {
      controller().handleError(apiError('unauthenticated', 401), controller().scope.current())
    })
    await screen.findByText('status:ready')
    expect(calls.refresh).toBe(2)
  })

  it('a stale 401 never starts a refresh', async () => {
    const { gateway, calls } = counting()
    const { controller } = renderSession(gateway)
    await screen.findByText('status:ready')
    const stale = controller().scope.current() - 1
    expect(controller().handleError(apiError('unauthenticated', 401), stale)).toBe(true)
    await flush()
    expect(calls.challenge).toBe(0)
    expect(screen.getByText('status:ready')).toBeTruthy()
  })

  it('a 404 from the refresh is the explicit no-organization state, and an outage offers retry', async () => {
    const noOrg = counting({ getSession: async () => { throw apiError('unauthenticated', 401) }, refreshSession: async () => { throw apiError('not_available', 404) } })
    renderSession(noOrg.gateway)
    await screen.findByText('status:no_organization')

    const outage = counting({ getSession: async () => { throw apiError('unauthenticated', 401) }, refreshSession: async () => { throw apiError('temporarily_unavailable', 503) } })
    renderSession(outage.gateway)
    await screen.findByText('status:error')
  })

  it('a 404 on the session itself is the explicit no-organization state', async () => {
    const { gateway } = counting({ getSession: async () => { throw apiError('not_available', 404) } })
    renderSession(gateway)
    await screen.findByText('status:no_organization')
  })
})

describe('sign-in and recovery', () => {
  it('a successful sign-in replaces the session and renews both allowances', async () => {
    const { gateway, calls } = counting({ getSession: async () => { throw apiError('unauthenticated', 401) } })
    const { controller } = renderSession(gateway)
    await screen.findByText('status:unauthenticated')
    let result: ActionResult | undefined
    await act(async () => {
      result = await controller().signIn({ email: 'a@example.test', password: 'secret' })
    })
    expect(result).toEqual({ kind: 'ok' })
    expect(screen.getByText('status:ready')).toBeTruthy()
    expect(calls.challenge).toBe(2) // one for the refresh attempt, one for the sign-in
    expect(calls.login).toBe(1)
    expect(controller().context).not.toBeNull()
  })

  it.each([
    ['unauthenticated', 401, 'rejected'],
    ['rate_limited', 429, 'rate_limited'],
    ['temporarily_unavailable', 503, 'unavailable'],
    ['request_invalid', 400, 'invalid'],
  ] as const)('a %s login failure is returned generically and the page stays signed out', async (code, status, expected) => {
    const { gateway } = counting({
      getSession: async () => { throw apiError('unauthenticated', 401) },
      login: async () => { throw apiError(code, status) },
    })
    const { controller } = renderSession(gateway)
    await screen.findByText('status:unauthenticated')
    let result: ActionResult | undefined
    await act(async () => {
      result = await controller().signIn({ email: 'a@example.test', password: 'secret' })
    })
    expect(result?.kind).toBe('failed')
    if (result?.kind === 'failed') expect(result.failure.code).toBe(expected)
    expect(screen.getByText('status:unauthenticated')).toBeTruthy()
  })

  it('a 404 on login becomes the no-organization state rather than a form error', async () => {
    const { gateway } = counting({
      getSession: async () => { throw apiError('unauthenticated', 401) },
      login: async () => { throw apiError('not_available', 404) },
    })
    const { controller } = renderSession(gateway)
    await screen.findByText('status:unauthenticated')
    let result: ActionResult | undefined
    await act(async () => {
      result = await controller().signIn({ email: 'a@example.test', password: 'secret' })
    })
    expect(result).toEqual({ kind: 'ok' })
    expect(screen.getByText('status:no_organization')).toBeTruthy()
  })

  it('a late result from a superseded sign-in attempt cannot touch the newer one (success and failure)', async () => {
    const outcomes: Array<(value: 'ok' | 'fail') => void> = []
    const { gateway } = counting({
      getSession: async () => { throw apiError('unauthenticated', 401) },
      login: async (proof, input, signal) => {
        const verdict = await new Promise<'ok' | 'fail'>((resolve) => outcomes.push(resolve))
        if (verdict === 'fail') throw apiError('unauthenticated', 401)
        return createFixtureGateway().login(proof, input, signal)
      },
    })
    const { controller } = renderSession(gateway)
    await screen.findByText('status:unauthenticated')
    let first: Promise<ActionResult>
    let second: Promise<ActionResult>
    act(() => {
      first = controller().signIn({ email: 'a@example.test', password: 'one' })
      second = controller().signIn({ email: 'a@example.test', password: 'two' })
    })
    await waitFor(() => expect(outcomes).toHaveLength(2))
    // The first attempt was superseded: its late failure is dropped and so is its late success.
    act(() => outcomes[0]!('fail'))
    await expect(first!).resolves.toEqual({ kind: 'superseded' })
    expect(screen.getByText('status:unauthenticated')).toBeTruthy()
    act(() => outcomes[1]!('ok'))
    await expect(second!).resolves.toEqual({ kind: 'ok' })
    await screen.findByText('status:ready')
  })

  it('recovery resolves identically for any address and changes no session state', async () => {
    const { gateway, calls } = counting({ getSession: async () => { throw apiError('unauthenticated', 401) } })
    const { controller } = renderSession(gateway)
    await screen.findByText('status:unauthenticated')
    let result: ActionResult | undefined
    await act(async () => {
      result = await controller().requestRecovery({ email: 'nobody@example.test' })
    })
    expect(result).toEqual({ kind: 'ok' })
    expect(calls.recovery).toBe(1)
    expect(screen.getByText('status:unauthenticated')).toBeTruthy()
  })
})

describe('sign-out', () => {
  it('fences protected state immediately, then reports the upstream status on the sign-in screen', async () => {
    let release!: () => void
    const { gateway, calls } = counting({
      logout: async (proof, input, signal) => {
        await new Promise<void>((resolve) => (release = resolve))
        return createFixtureGateway().logout(proof, input, signal)
      },
    })
    const { controller } = renderSession(gateway)
    await screen.findByText('status:ready')
    const generation = controller().scope.current()
    let pending: Promise<ActionResult>
    act(() => {
      pending = controller().signOut('local')
    })
    await screen.findByText('status:signing_out')
    expect(controller().context).toBeNull()
    expect(controller().scope.isCurrent(generation)).toBe(false) // in-flight reads are already stale
    act(() => release())
    await expect(pending!).resolves.toEqual({ kind: 'ok' })
    await screen.findByText('status:unauthenticated')
    expect(screen.getByText('notice:signed_out:pending')).toBeTruthy()
    expect(calls.logout).toBe(1)
  })

  it('an unconfirmed sign-out keeps content hidden with the session retained for retry', async () => {
    let attempts = 0
    const { gateway } = counting({
      logout: async (proof, input, signal) => {
        attempts += 1
        if (attempts === 1) throw apiError('temporarily_unavailable', 503)
        return createFixtureGateway().logout(proof, input, signal)
      },
    })
    const { controller } = renderSession(gateway)
    await screen.findByText('status:ready')
    await act(async () => {
      await controller().signOut('local')
    })
    expect(screen.getByText('status:sign_out_failed')).toBeTruthy()
    expect(controller().context).toBeNull()
    await act(async () => {
      await controller().signOut('local')
    })
    expect(screen.getByText('status:unauthenticated')).toBeTruthy()
  })

  it('a 401 on sign-out means the session is already gone', async () => {
    const { gateway } = counting({ logout: async () => { throw apiError('unauthenticated', 401) } })
    const { controller } = renderSession(gateway)
    await screen.findByText('status:ready')
    await act(async () => {
      await controller().signOut('global')
    })
    expect(screen.getByText('status:unauthenticated')).toBeTruthy()
    expect(screen.getByText('notice:session_ended')).toBeTruthy()
  })

  it('sign-out without a session proves with a challenge (no-organization state)', async () => {
    const { gateway, calls } = counting({ getSession: async () => { throw apiError('not_available', 404) } })
    const { controller } = renderSession(gateway)
    await screen.findByText('status:no_organization')
    await act(async () => {
      await controller().signOut('local')
    })
    expect(calls.challenge).toBe(1)
    expect(calls.logout).toBe(1)
    expect(screen.getByText('status:unauthenticated')).toBeTruthy()
  })
})

describe('organization switch', () => {
  it('a successful switch replaces the identity and invalidates old reads', async () => {
    const { gateway, calls } = counting()
    const { controller } = renderSession(gateway)
    await screen.findByText('status:ready')
    const generation = controller().scope.current()
    const contextBefore = controller().context
    let result: ActionResult | undefined
    await act(async () => {
      result = await controller().switchOrganization('00000000-0000-4000-8000-000000000012')
    })
    expect(result).toEqual({ kind: 'ok' })
    expect(screen.getByText('org:Synthetic organization B')).toBeTruthy()
    expect(controller().scope.isCurrent(generation)).toBe(false)
    expect(controller().context).not.toBe(contextBefore)
    expect(calls.switch).toBe(1)
  })

  it('a 404 on switch leaves the current session in place and reports the failure', async () => {
    const { gateway } = counting({ switchOrganization: async () => { throw apiError('not_available', 404) } })
    const { controller } = renderSession(gateway)
    await screen.findByText('status:ready')
    let result: ActionResult | undefined
    await act(async () => {
      result = await controller().switchOrganization('00000000-0000-4000-8000-000000000099')
    })
    // Regression: a switch 404 once moved the whole session to no_organization; the target being
    // unavailable must leave the current identity ready and report in place.
    expect(result).toMatchObject({ kind: 'failed', failure: { code: 'no_organization' } })
    expect(screen.getByText('status:ready')).toBeTruthy()
    expect(screen.getByText('org:Synthetic organization A')).toBeTruthy()
    expect(controller().context?.contextId).toBe('context_A_0123456789')
  })

  it('a 409 on switch consumes the one context recovery like any current 409', async () => {
    const { gateway, calls } = counting({ switchOrganization: async () => { throw apiError('context_changed', 409) } })
    const { controller } = renderSession(gateway)
    await screen.findByText('status:ready')
    await act(async () => {
      await controller().switchOrganization('00000000-0000-4000-8000-000000000012')
    })
    await screen.findByText('status:ready')
    expect(calls.session).toBe(2) // bootstrap + the single recovery
    await act(async () => {
      await controller().switchOrganization('00000000-0000-4000-8000-000000000012')
    })
    await screen.findByText('status:retry_required')
    expect(calls.session).toBe(2)
  })

  it('a 401 on switch follows the bounded refresh policy', async () => {
    const { gateway, calls } = counting({
      switchOrganization: async () => { throw apiError('unauthenticated', 401) },
      refreshSession: async () => createFixtureGateway({ refreshSession: 'lifecycle_a' }).refreshSession({ csrfToken: 'x'.repeat(16) }),
    })
    const { controller } = renderSession(gateway)
    await screen.findByText('status:ready')
    await act(async () => {
      await controller().switchOrganization('00000000-0000-4000-8000-000000000012')
    })
    await screen.findByText('status:ready')
    expect(calls.refresh).toBe(1)
  })
})

describe('no credential or proof is ever stored', () => {
  it('sign-in leaves localStorage and sessionStorage empty', async () => {
    const { gateway } = counting({ getSession: async () => { throw apiError('unauthenticated', 401) } })
    const { controller } = renderSession(gateway)
    await screen.findByText('status:unauthenticated')
    await act(async () => {
      await controller().signIn({ email: 'a@example.test', password: 'secret' })
    })
    expect(screen.getByText('status:ready')).toBeTruthy()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(document.cookie).toBe('')
  })
})
