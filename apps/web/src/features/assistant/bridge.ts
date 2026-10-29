// Typed port to the desktop in-app agents bridge (docs/desktop-and-connectors.md §4). The web UI
// never talks to an AI runtime directly: it calls narrow Tauri commands that the native backend
// agent will implement in src-tauri/src/agents. Desktop detection is a typed capability object
// injected by the native init script, never a user-agent sniff.
//
// AIDEV-NOTE: contract-request — the native commands agents_start/agents_send/agents_cancel/
// agents_end and event channel agents://event do not exist yet (backend agent owns src/agents).
// TauriAgentsBridge targets those proposed names; until host_capabilities reports
// assistant_bridge=true the panel shows an honest unavailable state.
import { z } from 'zod'

export const ASSISTANT_RUNTIMES = ['codex', 'claude'] as const
export type AssistantRuntime = (typeof ASSISTANT_RUNTIMES)[number]
const runtimeSchema = z.enum(ASSISTANT_RUNTIMES)

/** Shape of the capability object the native init script injects as `window.elevateoDesktop`. */
const desktopHostSchema = z.object({
  desktop: z.literal(true),
  platform: z.string().min(1),
  version: z.string().min(1),
  invoke: z.custom<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>((v) => typeof v === 'function'),
  listen: z.custom<(event: string, callback: (payload: unknown) => void) => Promise<() => void>>((v) => typeof v === 'function'),
})
export type DesktopHost = z.infer<typeof desktopHostSchema>

/** Returns the typed desktop host when running inside the native shell, else null (browser). */
export function detectDesktopHost(candidate: unknown = (globalThis as { elevateoDesktop?: unknown }).elevateoDesktop): DesktopHost | null {
  const parsed = desktopHostSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

const hostCapabilitiesSchema = z.object({
  desktop: z.literal(true),
  platform: z.string(),
  version: z.string(),
  assistant_bridge: z.boolean(),
})

// ---- events streamed from the native bridge over the `agents://event` channel ------------------

export const agentEventSchema = z.discriminatedUnion('type', [
  // Plain-text chunk of the assistant's reply; never HTML, rendered as text only.
  z.object({ type: z.literal('output_delta'), session_id: z.string().min(1), text: z.string() }),
  z.object({ type: z.literal('completed'), session_id: z.string().min(1) }),
  z.object({ type: z.literal('error'), session_id: z.string().min(1), message: z.string() }),
  z.object({ type: z.literal('ended'), session_id: z.string().min(1) }),
])
export type AgentEvent = z.infer<typeof agentEventSchema>

export const AGENT_EVENT_CHANNEL = 'agents://event'

// ---- the port -----------------------------------------------------------------------------------

export type BridgeAvailability = { available: true } | { available: false; reason: string }

export interface AgentsBridge {
  /** Checked before showing session controls; false renders the honest unavailable state. */
  availability(): Promise<BridgeAvailability>
  /** Starts a session on the chosen runtime; resolves to the session id. */
  start(runtime: AssistantRuntime): Promise<string>
  send(sessionId: string, text: string): Promise<void>
  /** Cancels the in-flight turn; the session stays open. */
  cancel(sessionId: string): Promise<void>
  /** Ends the session and releases the runtime process. */
  end(sessionId: string): Promise<void>
  /**
   * Streams validated events. An invalid payload is never rendered or forwarded: it is reported
   * through onProtocolError so the caller can stop the turn instead of waiting forever.
   * Returns unsubscribe; rejects when the event channel cannot be opened.
   */
  subscribe(onEvent: (event: AgentEvent) => void, onProtocolError: () => void): Promise<() => void>
}

const startResultSchema = z.object({ session_id: z.string().min(1) })

/** Tauri implementation calling the proposed native commands. */
export class TauriAgentsBridge implements AgentsBridge {
  constructor(private readonly host: DesktopHost) {}

  async availability(): Promise<BridgeAvailability> {
    try {
      const raw = await this.host.invoke('host_capabilities')
      const caps = hostCapabilitiesSchema.parse(raw)
      return caps.assistant_bridge
        ? { available: true }
        : { available: false, reason: 'The assistant runtime is not available in this build yet.' }
    } catch {
      return { available: false, reason: 'The desktop host did not answer the capability check.' }
    }
  }

  async start(runtime: AssistantRuntime): Promise<string> {
    const raw = await this.host.invoke('agents_start', { runtime: runtimeSchema.parse(runtime) })
    return startResultSchema.parse(raw).session_id
  }

  async send(sessionId: string, text: string): Promise<void> {
    await this.host.invoke('agents_send', { session_id: sessionId, text })
  }

  async cancel(sessionId: string): Promise<void> {
    await this.host.invoke('agents_cancel', { session_id: sessionId })
  }

  async end(sessionId: string): Promise<void> {
    await this.host.invoke('agents_end', { session_id: sessionId })
  }

  async subscribe(onEvent: (event: AgentEvent) => void, onProtocolError: () => void): Promise<() => void> {
    return this.host.listen(AGENT_EVENT_CHANNEL, (payload) => {
      const parsed = agentEventSchema.safeParse(payload)
      // The payload itself is never rendered or logged (it may hold mail content); the failure is.
      if (parsed.success) onEvent(parsed.data)
      else onProtocolError()
    })
  }
}

/** Stub used while the native bridge does not exist; every surface reports honest unavailability. */
export function unavailableBridge(reason: string): AgentsBridge {
  const refuse = () => Promise.reject(new Error(reason))
  return {
    availability: () => Promise.resolve({ available: false, reason }),
    start: refuse,
    send: refuse,
    cancel: refuse,
    end: refuse,
    subscribe: () => Promise.resolve(() => {}),
  }
}

/**
 * Bridge for the current environment: Tauri when the typed desktop capability is present
 * (availability still depends on host_capabilities.assistant_bridge), else the stub.
 */
export function createAssistantBridge(): AgentsBridge {
  const host = detectDesktopHost()
  return host ? new TauriAgentsBridge(host) : unavailableBridge('The assistant is only available in the desktop app.')
}
