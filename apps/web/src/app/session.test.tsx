// FE-R04/R13/R16 and V3: canonical-status fixtures drive errors through rendered real read
// requests; one recovery per allowance; shared automatic-refresh eligibility scheduled against the
// last request's deadline (offset focus/visibility requests never stretch visible freshness past
// one interval); unchanged identity preserves read ownership; stale completions never clear a
// newer context; owned timers/listeners are gone on unmount before fake timers are restored.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { GatewayError } from '@/data/errors'
import type { MailroomGateway } from '@/data/gateway'
import { SESSION_FRESHNESS_INTERVAL_MS, SessionProvider, useSession, type SessionController } from './session'

function Probe({ grab }: { grab: (controller: SessionController) => void }) {
  const controller = useSession()
  grab(controller)
  return <p>status:{controller.state.status}</p>
}

/** A rendered consumer issuing real read requests, like every protected page does (V3). */
function ReadProbe({ gateway }: { gateway: MailroomGateway }) {
  const { scope, context, handleError } = useSession()
  const [note, setNote] = useState('read:idle')
  const read = () => {
    if (!context) return
    const generation = scope.current()
    setNote('read:pending')
    gateway.listMailboxes(context, {}).then(
      () => {
        if (scope.isCurrent(generation)) setNote('read:ok')
      },
      (error: unknown) => {
        if (!handleError(error, generation)) setNote('read:unhandled')
      },
    )
  }
  return (
    <>
      <button onClick={read}>read</button>
      <p>{note}</p>
    </>
  )
}

/** Fixture-backed gateway with per-call scripts; canonical status/code pairs only (D2). */
function scriptedGateway(script: { sessions?: string[]; reads?: string[] } = {}) {
  const sessions = [...(script.sessions ?? ['session_a'])]
  const reads = [...(script.reads ?? ['mailboxes'])]
  let sessionCalls = 0
  let readCalls = 0
  const next = (queue: string[]) => (queue.length > 1 ? queue.shift()! : queue[0]!)
  const base = createFixtureGateway()
  const gateway: MailroomGateway = {
    ...base,
    getSession: (signal) => {
      sessionCalls += 1
      return createFixtureGateway({ getSession: next(sessions) }).getSession(signal)
    },
    listMailboxes: (ctx, query, signal) => {
      readCalls += 1
      return createFixtureGateway({ listMailboxes: next(reads) }).listMailboxes(ctx, query, signal)
    },
  }
  return { gateway, sessionCalls: () => sessionCalls, readCalls: () => readCalls }
}

function renderSession(gateway: MailroomGateway) {
  let latest: SessionController | undefined
  const view = render(
    <SessionProvider gateway={gateway}>
      <Probe grab={(c) => (latest = c)} />
      <ReadProbe gateway={gateway} />
    </SessionProvider>,
  )
  return { controller: () => latest!, unmount: view.unmount }
}

const flush = () => act(async () => {})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SessionProvider bootstrap', () => {
  it('bootstraps to ready with the fixture session', async () => {
    renderSession(createFixtureGateway())
    await screen.findByText('status:ready')
  })

  it('an unauthenticated bootstrap shows the session-unavailable state', async () => {
    renderSession(createFixtureGateway({ getSession: 'unauthenticated' }))
    await screen.findByText('status:unauthenticated')
  })

  it('a failed session validation enters a deliberate error state', async () => {
    renderSession(createFixtureGateway({ getSession: 'internal_error' }))
    await screen.findByText('status:error')
  })

  it('repeated explicit retries while one attempt is in flight coalesce into one request', async () => {
    let sessionCalls = 0
    let release!: () => void
    const fixture = createFixtureGateway()
    const gateway: MailroomGateway = {
      ...fixture,
      getSession: async (signal) => {
        sessionCalls += 1
        await new Promise<void>((resolve) => (release = resolve))
        return fixture.getSession(signal)
      },
    }
    const { controller } = renderSession(gateway)
    await flush()
    expect(sessionCalls).toBe(1)
    act(() => {
      controller().refresh()
      controller().refresh()
    })
    expect(sessionCalls).toBe(1) // the bootstrap attempt is still in flight; clicks coalesce (D2)
    act(() => release())
    await screen.findByText('status:ready')
    expect(sessionCalls).toBe(1)
  })

  it('explicit retries during a pending explicit retry also coalesce', async () => {
    let sessionCalls = 0
    const releases: Array<() => void> = []
    const fixture = createFixtureGateway()
    const gateway: MailroomGateway = {
      ...fixture,
      getSession: async (signal) => {
        sessionCalls += 1
        if (sessionCalls > 1) await new Promise<void>((resolve) => releases.push(resolve))
        return fixture.getSession(signal)
      },
    }
    const { controller } = renderSession(gateway)
    await screen.findByText('status:ready')
    expect(sessionCalls).toBe(1)
    act(() => controller().refresh()) // starts an explicit retry that stays in flight
    expect(sessionCalls).toBe(2)
    act(() => {
      controller().refresh()
      controller().refresh()
    })
    expect(sessionCalls).toBe(2) // the pending explicit retry absorbs repeated clicks (D2)
    act(() => releases.forEach((release) => release()))
    await screen.findByText('status:ready')
    expect(sessionCalls).toBe(2)
  })
})

describe('context recovery through rendered reads', () => {
  it('a canonical 409 recovers once, a second blocks until explicit retry renews the allowance', async () => {
    const { gateway, sessionCalls } = scriptedGateway({ reads: ['context_changed'] })
    const { controller } = renderSession(gateway)
    await screen.findByText('status:ready')
    expect(sessionCalls()).toBe(1)

    fireEvent.click(screen.getByText('read'))
    await waitFor(() => expect(sessionCalls()).toBe(2)) // exactly one automatic recovery
    await screen.findByText('status:ready')

    fireEvent.click(screen.getByText('read'))
    await screen.findByText('status:retry_required')
    expect(sessionCalls()).toBe(2)

    // Same-tick smoke check that no listeners exist while blocked; the fake-timer regression under
    // "automatic freshness" proves it past the 30s eligibility deadline, where the request throttle
    // can no longer mask a broken gate (D2).
    act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await flush()
    expect(sessionCalls()).toBe(2)
    expect(screen.getByText('status:retry_required')).toBeTruthy()

    act(() => controller().refresh())
    await screen.findByText('status:ready')
    expect(sessionCalls()).toBe(3)

    // Explicit retry replenished the one allowance, so the next 409 recovers again.
    fireEvent.click(screen.getByText('read'))
    await waitFor(() => expect(sessionCalls()).toBe(4))
    await screen.findByText('status:ready')
  })

  it('a successful read does not renew the spent allowance (FE-R16)', async () => {
    const { gateway, sessionCalls } = scriptedGateway({ reads: ['context_changed', 'mailboxes', 'context_changed'] })
    renderSession(gateway)
    await screen.findByText('status:ready')

    fireEvent.click(screen.getByText('read'))
    await waitFor(() => expect(sessionCalls()).toBe(2)) // allowance spent on the first 409
    await screen.findByText('status:ready')

    fireEvent.click(screen.getByText('read'))
    await screen.findByText('read:ok') // a successful read in between…

    fireEvent.click(screen.getByText('read'))
    await screen.findByText('status:retry_required') // …does not renew the allowance
    expect(sessionCalls()).toBe(2)
  })

  it('a current 401 clears the session immediately', async () => {
    const { gateway } = scriptedGateway({ reads: ['unauthenticated'] })
    const { controller } = renderSession(gateway)
    await screen.findByText('status:ready')
    fireEvent.click(screen.getByText('read'))
    await screen.findByText('status:unauthenticated')
    expect(controller().context).toBeNull()
  })

  it('a stale 401 from a leaked request cannot clear the newer session', async () => {
    const fixture = createFixtureGateway()
    let rejectRead!: (error: unknown) => void
    const gateway: MailroomGateway = {
      ...fixture,
      listMailboxes: () => new Promise((_resolve, reject) => (rejectRead = reject)),
    }
    const { controller } = renderSession(gateway)
    await screen.findByText('status:ready')

    fireEvent.click(screen.getByText('read')) // request now pending under the current generation
    await screen.findByText('read:pending')
    act(() => controller().refresh()) // explicit retry invalidates that generation
    await screen.findByText('status:ready')

    const leaked = new GatewayError('api', 'unauthenticated', 'synthetic', { status: 401, requestId: 'r1' })
    act(() => rejectRead(leaked))
    await flush()
    expect(screen.getByText('status:ready')).toBeTruthy() // consumed as stale; session B intact
    expect(screen.getByText('read:pending')).toBeTruthy() // and not misreported as a page error
    expect(controller().context).not.toBeNull()
  })

  it('other API errors are left to the page', async () => {
    const { gateway } = scriptedGateway({ reads: ['rate_limited'] })
    renderSession(gateway)
    await screen.findByText('status:ready')
    fireEvent.click(screen.getByText('read'))
    await screen.findByText('read:unhandled')
    expect(screen.getByText('status:ready')).toBeTruthy()
  })
})

describe('automatic freshness', () => {
  afterEach(() => {
    // Owned timers must already be gone when a test unmounted the provider; restoring real timers
    // here must not conceal a leak, so assertions on getTimerCount happen before this line runs.
    vi.useRealTimers()
  })

  it('refreshes on the 30s schedule and an unchanged identity preserves read ownership', async () => {
    vi.useFakeTimers()
    const { gateway, sessionCalls } = scriptedGateway()
    const { controller } = renderSession(gateway)
    await flush()
    expect(screen.getByText('status:ready')).toBeTruthy()
    const contextBefore = controller().context
    const generationBefore = controller().scope.current()

    // Bursts inside the 30s window coalesce to zero requests (FE-R04).
    await act(async () => {
      vi.advanceTimersByTime(10_000)
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
    expect(sessionCalls()).toBe(1)

    await act(async () => {
      vi.advanceTimersByTime(SESSION_FRESHNESS_INTERVAL_MS)
    })
    await flush()
    expect(sessionCalls()).toBe(2)
    // Unchanged identity: same context object, same generation, no remount pressure (D2/D3).
    expect(controller().context).toBe(contextBefore)
    expect(controller().scope.current()).toBe(generationBefore)
    expect(screen.getByText('status:ready')).toBeTruthy()

    // Immediately after a freshness request, focus is again ineligible.
    act(() => window.dispatchEvent(new Event('focus')))
    expect(sessionCalls()).toBe(2)
  })

  it('an offset visibility refresh does not stretch the next automatic refresh past one interval', async () => {
    vi.useFakeTimers()
    const { gateway, sessionCalls } = scriptedGateway()
    renderSession(gateway)
    await flush()
    expect(screen.getByText('status:ready')).toBeTruthy()

    // Hidden across the first 30s deadline: the timer tick is declined.
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    try {
      await act(async () => {
        vi.advanceTimersByTime(SESSION_FRESHNESS_INTERVAL_MS)
      })
      expect(sessionCalls()).toBe(1)
    } finally {
      delete (document as { visibilityState?: string }).visibilityState
    }

    // Visible again at t=31s: the visibility handler refreshes immediately.
    await act(async () => {
      vi.advanceTimersByTime(1_000)
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await flush()
    expect(sessionCalls()).toBe(2)

    // A fixed 30s interval would decline its t=60s tick (29s elapsed) and wait until t=90s,
    // stretching visible freshness to 59s. Scheduling against the last request's deadline must
    // refresh at t=61s instead (D2, adversarial P2).
    await act(async () => {
      vi.advanceTimersByTime(SESSION_FRESHNESS_INTERVAL_MS - 1_000)
    })
    expect(sessionCalls()).toBe(2) // t=60s: still inside the 30s window since the t=31s request
    await act(async () => {
      vi.advanceTimersByTime(1_000)
    })
    await flush()
    expect(sessionCalls()).toBe(3) // t=61s: exactly one interval after the offset request
  })

  it('automatic events stay inert while blocked, even past the eligibility and timer deadlines', async () => {
    vi.useFakeTimers()
    const { gateway, sessionCalls } = scriptedGateway({ reads: ['context_changed'] })
    renderSession(gateway)
    await flush()
    expect(screen.getByText('status:ready')).toBeTruthy()

    fireEvent.click(screen.getByText('read')) // first 409 spends the allowance on a recovery
    await flush()
    expect(sessionCalls()).toBe(2)
    expect(screen.getByText('status:ready')).toBeTruthy()
    fireEvent.click(screen.getByText('read')) // second 409 blocks until explicit retry
    await flush()
    expect(screen.getByText('status:retry_required')).toBeTruthy()

    // Advance well past the 30s eligibility threshold and any timer deadline before dispatching,
    // so the request throttle cannot mask a broken ready-only gate: nothing may fire (D2).
    await act(async () => {
      vi.advanceTimersByTime(SESSION_FRESHNESS_INTERVAL_MS * 2)
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await flush()
    expect(sessionCalls()).toBe(2)
    expect(screen.getByText('status:retry_required')).toBeTruthy()
  })

  it('a hidden tab performs no automatic refresh', async () => {
    vi.useFakeTimers()
    const { gateway, sessionCalls } = scriptedGateway()
    renderSession(gateway)
    await flush()
    expect(screen.getByText('status:ready')).toBeTruthy()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    try {
      await act(async () => {
        vi.advanceTimersByTime(SESSION_FRESHNESS_INTERVAL_MS * 3)
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(sessionCalls()).toBe(1)
    } finally {
      delete (document as { visibilityState?: string }).visibilityState
    }
  })

  it('a changed identity invalidates old reads and does not renew a spent allowance', async () => {
    vi.useFakeTimers()
    const { gateway, sessionCalls } = scriptedGateway({
      sessions: ['session_a', 'session_a', 'session_b'],
      reads: ['context_changed'],
    })
    const { controller } = renderSession(gateway)
    await flush()
    expect(screen.getByText('status:ready')).toBeTruthy()

    fireEvent.click(screen.getByText('read')) // spends the allowance; recovery returns session_a
    await flush()
    expect(sessionCalls()).toBe(2)
    expect(screen.getByText('status:ready')).toBeTruthy()
    const generationBefore = controller().scope.current()
    const contextBefore = controller().context

    await act(async () => {
      vi.advanceTimersByTime(SESSION_FRESHNESS_INTERVAL_MS)
    })
    await flush()
    expect(sessionCalls()).toBe(3) // freshness returned session_b
    expect(controller().scope.current()).toBeGreaterThan(generationBefore) // old reads rejected
    expect(controller().context).not.toBe(contextBefore)
    expect(screen.getByText('status:ready')).toBeTruthy()

    fireEvent.click(screen.getByText('read')) // the identity change did not renew the allowance
    await flush()
    expect(screen.getByText('status:retry_required')).toBeTruthy()
    expect(sessionCalls()).toBe(3)
  })

  it('unmounting removes every owned timer and listener', async () => {
    vi.useFakeTimers()
    const { gateway, sessionCalls } = scriptedGateway()
    const { unmount } = renderSession(gateway)
    await flush()
    expect(screen.getByText('status:ready')).toBeTruthy()
    unmount()
    expect(vi.getTimerCount()).toBe(0) // asserted before afterEach restores real timers (D7)
    await act(async () => {
      vi.advanceTimersByTime(SESSION_FRESHNESS_INTERVAL_MS * 2)
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(sessionCalls()).toBe(1)
  })
})
