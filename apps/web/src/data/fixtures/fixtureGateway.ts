// Development/test gateway over the canonical fixtures. This module and its data are only
// reachable from the dev-fixtures entry point and tests; production builds exclude them and no
// runtime failure may fall back here (contract README, R5).
import fixtures from '../../../../../contracts/v1/fixtures.json'
import type { z } from 'zod'
import { GatewayError } from '../errors'
import { ErrorSchema, MailboxPageSchema, SessionSchema, ThreadDetailPageSchema, ThreadPageSchema } from '../contract'
import type { MailroomGateway } from '../gateway'

type Operation = 'getSession' | 'listMailboxes' | 'listThreads' | 'getThread'

export interface FixtureScript {
  /** Fixture example name per operation; an Error example raises the matching GatewayError. */
  [operation: string]: string | undefined
}

const DEFAULTS: Record<Operation, string> = {
  getSession: 'session_a',
  listMailboxes: 'mailboxes',
  listThreads: 'threads',
  getThread: 'thread_hostile_plaintext',
}

interface Example {
  status: number
  body: unknown
}

function example(name: string): Example {
  const found = (fixtures.examples as Record<string, Example | undefined>)[name]
  if (!found) throw new Error(`Unknown fixture example: ${name}`)
  return found
}

function resolve<S extends z.ZodType>(operation: Operation, script: FixtureScript, schema: S): z.output<S> {
  const name = script[operation] ?? DEFAULTS[operation]
  const data = example(name)
  if (data.status >= 400) {
    const result = ErrorSchema.safeParse(data.body)
    if (!result.success) throw new GatewayError('transport', 'malformed', `Fixture ${name} does not match the error contract.`)
    const body = result.data
    throw new GatewayError('api', body.code, body.message, { status: data.status, requestId: body.request_id })
  }
  // AIDEV-NOTE: Passing each concrete schema preserves its output type and the HTTP boundary validation.
  const parsed = schema.safeParse(data.body)
  if (!parsed.success) throw new GatewayError('transport', 'malformed', `Fixture ${name} does not match the contract.`)
  return parsed.data
}

export function createFixtureGateway(script: FixtureScript = {}): MailroomGateway {
  return {
    getSession: async () => resolve('getSession', script, SessionSchema),
    listMailboxes: async () => resolve('listMailboxes', script, MailboxPageSchema),
    listThreads: async () => resolve('listThreads', script, ThreadPageSchema),
    getThread: async () => resolve('getThread', script, ThreadDetailPageSchema),
  }
}
