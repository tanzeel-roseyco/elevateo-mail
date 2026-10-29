// Assistant panel behavior against a controllable fake bridge: honest unavailability, plain-text
// streaming transcript, failed start, event-channel readiness, session ownership on close, confirmed
// termination and one-turn-at-a-time sending. The fake stands in exactly at the AgentsBridge port;
// TauriAgentsBridge itself is exercised below against a fake DesktopHost (no Tauri in jsdom).
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssistantPanel } from './AssistantPanel'
import { AGENT_EVENT_CHANNEL, TauriAgentsBridge, type AgentEvent, type AgentsBridge, type BridgeAvailability, type DesktopHost } from './bridge'

type FakeBridge = AgentsBridge & { emit(event: AgentEvent): void; protocolError(): void }

function fakeBridge(overrides: Partial<AgentsBridge> = {}): FakeBridge {
  let handler: ((event: AgentEvent) => void) | null = null
  let protocolHandler: (() => void) | null = null
  return {
    availability: () => Promise.resolve<BridgeAvailability>({ available: true }),
    start: vi.fn(() => Promise.resolve('session-1')),
    send: vi.fn(() => Promise.resolve()),
    cancel: vi.fn(() => Promise.resolve()),
    end: vi.fn(() => Promise.resolve()),
    subscribe: (onEvent, onProtocolError) => {
      handler = onEvent
      protocolHandler = onProtocolError
      return Promise.resolve(() => {
        handler = null
      })
    },
    emit: (event) => handler?.(event),
    protocolError: () => protocolHandler?.(),
    ...overrides,
  }
}

async function startSession(bridge: AgentsBridge) {
  const view = render(<AssistantPanel bridge={bridge} onClose={() => {}} />)
  const start = await screen.findByRole('button', { name: 'Start session' })
  await act(async () => {}) // let the event subscription settle so Start is enabled
  fireEvent.click(start)
  await screen.findByLabelText('Message')
  return view
}

function send(text: string) {
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
}

afterEach(() => vi.restoreAllMocks())

describe('assistant panel', () => {
  // Failure path: the native bridge does not exist yet; the panel must say so, not pretend.
  it('shows the honest unavailable state when the runtime is not available', async () => {
    const bridge = fakeBridge({
      availability: () => Promise.resolve({ available: false, reason: 'The assistant runtime is not available in this build yet.' }),
    })
    render(<AssistantPanel bridge={bridge} onClose={() => {}} />)
    expect(await screen.findByText('Assistant runtime not available')).toBeTruthy()
    expect(screen.getByText('The assistant runtime is not available in this build yet.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start session' })).toBeNull()
  })

  // Happy path: start, send, receive streamed deltas; markup in output stays literal text.
  it('renders streamed events as plain text in the transcript', async () => {
    const bridge = fakeBridge()
    await startSession(bridge)
    send('Find the invoice thread')
    expect(bridge.send).toHaveBeenCalledWith('session-1', 'Find the invoice thread')
    await act(async () => {
      bridge.emit({ type: 'output_delta', session_id: 'session-1', text: '<b>Found</b> one ' })
      bridge.emit({ type: 'output_delta', session_id: 'session-1', text: 'matching thread.' })
      bridge.emit({ type: 'completed', session_id: 'session-1' })
    })
    const log = screen.getByRole('log', { name: 'Transcript' })
    expect(log.textContent).toContain('Find the invoice thread')
    // Deltas concatenate into one assistant entry, and the tag is literal text, not an element.
    expect(log.textContent).toContain('<b>Found</b> one matching thread.')
    expect(log.querySelector('b')).toBeNull()
  })

  // Failure path: a rejected start surfaces an error state and leaves the start controls usable.
  it('shows an error when the session cannot start', async () => {
    const bridge = fakeBridge({ start: vi.fn(() => Promise.reject(new Error('runtime process exited during startup'))) })
    render(<AssistantPanel bridge={bridge} onClose={() => {}} />)
    await act(async () => {})
    fireEvent.click(await screen.findByRole('button', { name: 'Start session' }))
    expect(await screen.findByText('The session could not be started')).toBeTruthy()
    expect(screen.getByText('runtime process exited during startup')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start session' })).toBeTruthy()
  })

  // Regression (P21-1): no session can start before replies can be received; failure is recoverable.
  it('keeps Start disabled until the event channel is ready and offers a retry when it fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let attempts = 0
    const bridge = fakeBridge()
    const working = bridge.subscribe
    bridge.subscribe = (onEvent, onProtocolError) => (++attempts === 1 ? Promise.reject(new Error('listen failed')) : working(onEvent, onProtocolError))
    render(<AssistantPanel bridge={bridge} onClose={() => {}} />)
    expect(await screen.findByText('Assistant replies could not be connected')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Start session' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await act(async () => {})
    expect(screen.queryByText('Assistant replies could not be connected')).toBeNull()
    expect((screen.getByRole('button', { name: 'Start session' }) as HTMLButtonElement).disabled).toBe(false)
  })

  // Regression (P21-2): closing the panel ends the session it owns, including one still starting.
  it('ends the owned session on close, and a start that resolves after close', async () => {
    const active = fakeBridge()
    const view = await startSession(active)
    view.unmount()
    expect(active.end).toHaveBeenCalledWith('session-1')

    let resolveStart!: (id: string) => void
    const pending = fakeBridge({ start: vi.fn(() => new Promise<string>((resolve) => (resolveStart = resolve))) })
    const second = render(<AssistantPanel bridge={pending} onClose={() => {}} />)
    await act(async () => {})
    fireEvent.click(await screen.findByRole('button', { name: 'Start session' }))
    second.unmount()
    await act(async () => resolveStart('late-session'))
    expect(pending.end).toHaveBeenCalledWith('late-session')
  })

  // Regression (P21-3): a rejected end is visible and retryable, never shown as ended.
  it('shows a failed end with a retry instead of claiming the session ended', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const end = vi.fn().mockRejectedValueOnce(new Error('runtime busy')).mockResolvedValueOnce(undefined)
    const bridge = fakeBridge({ end })
    await startSession(bridge)
    fireEvent.click(screen.getByRole('button', { name: 'End session' }))
    expect(await screen.findByText('The session may still be running')).toBeTruthy()
    expect(screen.queryByText(/The session has ended/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try ending again' }))
    expect(await screen.findByText(/The session has ended/)).toBeTruthy()
    expect(end).toHaveBeenNthCalledWith(2, 'session-1')
  })

  // Regression (P21-4): a second message cannot be sent while a reply is still streaming.
  it('locks Send while a response is streaming', async () => {
    const bridge = fakeBridge()
    await startSession(bridge)
    send('First question')
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Second question' } })
    const sendButton = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement
    expect(sendButton.disabled).toBe(true)
    fireEvent.click(sendButton)
    expect(bridge.send).toHaveBeenCalledTimes(1)
    await act(async () => bridge.emit({ type: 'completed', session_id: 'session-1' }))
    expect(sendButton.disabled).toBe(false)
  })

  // Regression (P22-1): an unreadable runtime event stops the turn visibly instead of hanging.
  it('stops the current response when the runtime sends an unreadable event', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const bridge = fakeBridge()
    await startSession(bridge)
    send('Summarise the thread')
    await act(async () => bridge.protocolError())
    expect(screen.getByRole('log', { name: 'Transcript' }).textContent).toContain('could not read')
    expect(bridge.cancel).toHaveBeenCalledWith('session-1')
    expect((screen.getByRole('button', { name: 'Cancel response' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

// The native bridge at its DesktopHost boundary (P22-2): commands, validation and event parsing.
describe('TauriAgentsBridge', () => {
  function fakeHost(invoke: DesktopHost['invoke']): DesktopHost & { deliver(payload: unknown): void } {
    let listener: ((payload: unknown) => void) | null = null
    return {
      desktop: true, platform: 'macos', version: '1.0.0', invoke,
      listen: vi.fn(async (_event: string, callback: (payload: unknown) => void) => {
        listener = callback
        return () => {}
      }),
      deliver: (payload) => listener?.(payload),
    }
  }

  it('starts a session and forwards valid events from the agents channel', async () => {
    const invoke = vi.fn(async (cmd: string) => (cmd === 'agents_start' ? { session_id: 'native-1' } : undefined))
    const host = fakeHost(invoke)
    const bridge = new TauriAgentsBridge(host)
    await expect(bridge.start('claude')).resolves.toBe('native-1')
    expect(invoke).toHaveBeenCalledWith('agents_start', { runtime: 'claude' })
    const onEvent = vi.fn()
    await bridge.subscribe(onEvent, () => {})
    expect(host.listen).toHaveBeenCalledWith(AGENT_EVENT_CHANNEL, expect.any(Function))
    host.deliver({ type: 'completed', session_id: 'native-1' })
    expect(onEvent).toHaveBeenCalledWith({ type: 'completed', session_id: 'native-1' })
  })

  it('reports malformed events as protocol errors without forwarding them', async () => {
    const host = fakeHost(vi.fn(async () => undefined))
    const onEvent = vi.fn()
    const onProtocolError = vi.fn()
    await new TauriAgentsBridge(host).subscribe(onEvent, onProtocolError)
    host.deliver({ type: 'error', session_id: 'native-1' }) // missing message
    expect(onEvent).not.toHaveBeenCalled()
    expect(onProtocolError).toHaveBeenCalledTimes(1)
  })

  it('treats malformed capability and start responses as unavailable or failed', async () => {
    const bridge = new TauriAgentsBridge(fakeHost(vi.fn(async (cmd: string) => (cmd === 'host_capabilities' ? { desktop: true } : { session: 'x' }))))
    await expect(bridge.availability()).resolves.toMatchObject({ available: false })
    await expect(bridge.start('codex')).rejects.toThrow()
  })
})
