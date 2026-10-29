// Assistant panel behavior against a controllable fake bridge: honest unavailability, plain-text
// streaming transcript, and a failed session start. No Tauri host exists in jsdom, so the fake
// stands in for the native agents bridge exactly at the AgentsBridge port boundary.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AssistantPanel } from './AssistantPanel'
import type { AgentEvent, AgentsBridge, BridgeAvailability } from './bridge'

function fakeBridge(overrides: Partial<AgentsBridge> = {}): AgentsBridge & { emit(event: AgentEvent): void } {
  let handler: ((event: AgentEvent) => void) | null = null
  return {
    availability: () => Promise.resolve<BridgeAvailability>({ available: true }),
    start: vi.fn(() => Promise.resolve('session-1')),
    send: vi.fn(() => Promise.resolve()),
    cancel: vi.fn(() => Promise.resolve()),
    end: vi.fn(() => Promise.resolve()),
    subscribe: (onEvent) => {
      handler = onEvent
      return Promise.resolve(() => {
        handler = null
      })
    },
    emit: (event) => handler?.(event),
    ...overrides,
  }
}

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
    render(<AssistantPanel bridge={bridge} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Start session' }))
    const inputField = await screen.findByLabelText('Message')
    fireEvent.change(inputField, { target: { value: 'Find the invoice thread' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
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
    fireEvent.click(await screen.findByRole('button', { name: 'Start session' }))
    expect(await screen.findByText('The session could not be started')).toBeTruthy()
    expect(screen.getByText('runtime process exited during startup')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start session' })).toBeTruthy()
  })
})
