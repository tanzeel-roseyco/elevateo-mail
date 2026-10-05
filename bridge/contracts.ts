import { z } from 'zod'

// AIDEV-NOTE: This is draft data, never an executable command, tool grant or authority to send.
const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/u)
export const bindingSchema = z.object({ accountId: id, generation: z.number().int().nonnegative() }).strict()
export type Binding = z.infer<typeof bindingSchema>
export const requestSchema = bindingSchema.extend({
  taskId: id, mailboxId: id, instruction: z.string().min(1).max(10_000),
  context: z.array(z.object({ messageId: id, trust: z.literal('untrusted-email'),
    text: z.string().max(100_000) }).strict()).max(20),
}).strict()
export type DraftRequest = z.infer<typeof requestSchema>
export const draftSchema = z.object({ subject: z.string().max(998), body: z.string().max(64_000) }).strict()
export type Draft = z.infer<typeof draftSchema>
export const limits = { inputBytes: 100_000, outputBytes: 64_000, timeoutMs: 60_000 } as const

export type Provider = 'codex' | 'claude'
export type Exit = 'success' | 'unavailable' | 'failed' | 'unknown'
export interface ProcessHandle {
  completion: Promise<Exit>
  /** Must resolve only after the entire contained process tree is confirmed stopped. */
  terminateTree(): Promise<boolean>
}
export interface Supervisor {
  // AIDEV-NOTE: A synchronous handle prevents cancellation losing ownership during process startup.
  start(provider: Provider, input: string, output: (chunk: Uint8Array) => void): ProcessHandle
}
