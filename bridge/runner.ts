import { bindingSchema, draftSchema, limits, requestSchema } from './contracts'
import type { Binding, Draft, Exit, ProcessHandle, Provider, Supervisor } from './contracts'

export class BridgeFailure extends Error {}
type Active = { controller: AbortController }
export class DraftBridge {
  private binding: Binding | undefined
  private active: Active | undefined
  private poisoned = false
  constructor(private readonly supervisor: Supervisor) {}

  bind(value: unknown): void {
    const next = value === null ? undefined : bindingSchema.parse(value)
    // AIDEV-NOTE: Every rebind invalidates outstanding work, including same-account permission changes.
    this.active?.controller.abort()
    this.binding = next
  }
  cancel(): void { this.active?.controller.abort() }
  private matches(binding: Binding): boolean {
    return this.binding?.accountId === binding.accountId && this.binding.generation === binding.generation
  }
  async draft(value: unknown): Promise<{ taskId: string; accountId: string; generation: number; draft: Draft }> {
    const request = requestSchema.parse(value)
    const input = JSON.stringify(request)
    if (new TextEncoder().encode(input).byteLength > limits.inputBytes) throw new BridgeFailure('INPUT_LIMIT')
    if (!this.matches(request)) throw new BridgeFailure('SESSION_CHANGED')
    if (this.poisoned) throw new BridgeFailure('TERMINATION_UNCONFIRMED')
    if (this.active) throw new BridgeFailure('BUSY')
    const active: Active = { controller: new AbortController() }
    this.active = active
    const timer = setTimeout(() => active.controller.abort(), limits.timeoutMs)
    try {
      for (const provider of ['codex', 'claude'] as const) {
        const result = await this.attempt(provider, input, active)
        if (active.controller.signal.aborted || !this.matches(request)) throw new BridgeFailure('CANCELLED')
        if (result.exit === 'unavailable' && provider === 'codex') continue
        if (result.exit !== 'success') throw new BridgeFailure('PROVIDER_FAILED')
        const draft = draftSchema.parse(JSON.parse(result.output) as unknown)
        return { taskId: request.taskId, accountId: request.accountId, generation: request.generation, draft }
      }
      throw new BridgeFailure('PROVIDER_FAILED')
    } finally {
      clearTimeout(timer)
      this.active = undefined
    }
  }
  private async attempt(provider: Provider, input: string, active: Active) {
    if (active.controller.signal.aborted) throw new BridgeFailure('CANCELLED')
    const chunks: Uint8Array[] = []
    let size = 0
    let overflow = false
    let accepting = true
    let process: ProcessHandle
    try { process = this.supervisor.start(provider, input, (chunk) => {
      if (!accepting || overflow || chunk.byteLength === 0) return
      size += chunk.byteLength
      if (size > limits.outputBytes) { overflow = true; active.controller.abort(); return }
      chunks.push(chunk.slice())
    }) } catch {
      // AIDEV-NOTE: A thrown startup may have launched a child without returning its handle; fail closed.
      this.poisoned = true
      throw new BridgeFailure('START_UNKNOWN')
    }
    let onAbort: () => void = () => undefined
    const interrupted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new BridgeFailure(overflow ? 'OUTPUT_LIMIT' : 'CANCELLED'))
      active.controller.signal.addEventListener('abort', onAbort, { once: true })
      if (active.controller.signal.aborted) onAbort()
    })
    let outcome: { ok: true; exit: Exit } | { ok: false; error: unknown }
    try { outcome = { ok: true, exit: await Promise.race([process.completion, interrupted]) } }
    catch (error) { outcome = { ok: false, error } }
    accepting = false
    active.controller.signal.removeEventListener('abort', onAbort)
    // AIDEV-NOTE: Cleanup failure takes precedence over completion/cancellation; an orphan forbids another launch.
    let stopped = false
    try { stopped = await process.terminateTree() } catch { this.poisoned = true }
    if (!stopped) { this.poisoned = true; throw new BridgeFailure('TERMINATION_UNCONFIRMED') }
    if (!outcome.ok) throw outcome.error
    if (overflow) throw new BridgeFailure('OUTPUT_LIMIT')
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return { exit: outcome.exit, output: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  }
}
