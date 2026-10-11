// Development/test gateway over the canonical fixtures. This module and its data are only
// reachable from the dev-fixtures entry point and tests; production builds exclude them and no
// runtime failure may fall back here (contract README, R5).
import fixtures from '../../../../../contracts/v1/fixtures.json'
import { GatewayError, type ApiErrorCode } from '../errors'
import { MailboxPageSchema, SessionSchema, ThreadDetailPageSchema, ThreadPageSchema } from '../contract'
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

const SCHEMAS = {
  getSession: SessionSchema,
  listMailboxes: MailboxPageSchema,
  listThreads: ThreadPageSchema,
  getThread: ThreadDetailPageSchema,
} as const

interface Example {
  status: number
  body: unknown
}

function example(name: string): Example {
  const found = (fixtures.examples as Record<string, Example | undefined>)[name]
  if (!found) throw new Error(`Unknown fixture example: ${name}`)
  return found
}

function resolve<O extends Operation>(operation: O, script: FixtureScript) {
  const name = script[operation] ?? DEFAULTS[operation]
  const data = example(name)
  if (data.status >= 400) {
    const body = data.body as { code: ApiErrorCode; message: string; request_id: string }
    throw new GatewayError('api', body.code, body.message, { status: data.status, requestId: body.request_id })
  }
  // Fixture bodies pass the same runtime validation as HTTP responses (shared conformance, R2).
  const parsed = SCHEMAS[operation].safeParse(data.body)
  if (!parsed.success) throw new GatewayError('transport', 'malformed', `Fixture ${name} does not match the contract.`)
  return parsed.data
}

export function createFixtureGateway(script: FixtureScript = {}): MailroomGateway {
  return {
    getSession: async () => resolve('getSession', script),
    listMailboxes: async () => resolve('listMailboxes', script),
    listThreads: async () => resolve('listThreads', script),
    getThread: async () => resolve('getThread', script),
  }
}
