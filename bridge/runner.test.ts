import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DraftBridge } from './runner'
import type { Exit, Provider, Supervisor } from './contracts'

const binding = { accountId: 'alice', generation: 1 }
const request = { ...binding, taskId: 't1', mailboxId: 'm1', instruction: 'Draft a reply',
  context: [{ messageId: 'msg1', trust: 'untrusted-email', text: 'Hello' }] }
const encoded = new TextEncoder().encode(JSON.stringify({ subject: 'Reply', body: 'Hello back' }))
function fixture(exits: Exit[] = ['success'], stopped = true) {
  const events: string[] = []
  const supervisor: Supervisor = { start(provider, input, output) {
    events.push(provider)
    assert.equal(JSON.parse(input).context[0].trust, 'untrusted-email')
    output(encoded)
    return { completion: Promise.resolve(exits.shift() ?? 'failed'),
      async terminateTree() { events.push('stopped'); return stopped } }
  } }
  const bridge = new DraftBridge(supervisor)
  bridge.bind(binding)
  return { bridge, events }
}
test('returns only a validated draft bound to the requesting session', async () => {
  const f = fixture()
  assert.deepEqual(await f.bridge.draft(request), { ...binding, taskId: 't1',
    draft: { subject: 'Reply', body: 'Hello back' } })
  assert.deepEqual(f.events, ['codex', 'stopped'])
})
test('fallback happens only after definite unavailability and confirmed tree termination', async () => {
  const f = fixture(['unavailable', 'success'])
  await f.bridge.draft(request)
  assert.deepEqual(f.events, ['codex', 'stopped', 'claude', 'stopped'])
  for (const exit of ['unknown', 'failed'] as const) {
    const failed = fixture([exit])
    await assert.rejects(failed.bridge.draft(request), /PROVIDER_FAILED/u)
    assert.deepEqual(failed.events, ['codex', 'stopped'])
  }
})
test('unconfirmed termination prevents fallback and all subsequent tasks', async () => {
  const f = fixture(['unavailable'], false)
  await assert.rejects(f.bridge.draft(request), /TERMINATION_UNCONFIRMED/u)
  await assert.rejects(f.bridge.draft(request), /TERMINATION_UNCONFIRMED/u)
  assert.deepEqual(f.events, ['codex', 'stopped'])
})
test('strict session and UTF8 input boundaries reject before launch', async () => {
  const f = fixture()
  await assert.rejects(f.bridge.draft({ ...request, accountId: 'bob' }), /SESSION_CHANGED/u)
  await assert.rejects(f.bridge.draft({ ...request, command: 'send' }))
  await assert.rejects(f.bridge.draft({ ...request, context: [{ ...request.context[0], text: '😀'.repeat(26_000) }] }), /INPUT_LIMIT/u)
  assert.deepEqual(f.events, [])
})
test('one active task, cancellation and account changes never return old data or fallback', async () => {
  for (const change of ['cancel', 'account'] as const) {
    let stopped = 0
    const bridge = new DraftBridge({ start() { return { completion: new Promise<Exit>(() => undefined),
      async terminateTree() { stopped++; return true } } } })
    bridge.bind(binding)
    const running = bridge.draft(request)
    await assert.rejects(bridge.draft(request), /BUSY/u)
    if (change === 'cancel') bridge.cancel()
    else bridge.bind({ accountId: 'bob', generation: 2 })
    await assert.rejects(running, /CANCELLED/u)
    assert.equal(stopped, 1)
  }
})
test('overflow and malformed results cannot become drafts or trigger fallback', async () => {
  for (const bytes of [new Uint8Array(64_001), new TextEncoder().encode('{"send":true}'), new Uint8Array([255])]) {
    const providers: Provider[] = []
    const bridge = new DraftBridge({ start(provider, _input, output) { providers.push(provider); output(bytes)
      return { completion: Promise.resolve('success'), async terminateTree() { return true } } } })
    bridge.bind(binding)
    await assert.rejects(bridge.draft(request))
    assert.deepEqual(providers, ['codex'])
  }
})
test('60 second deadline terminates work without fallback', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let stopped = 0
  const bridge = new DraftBridge({ start() { return { completion: new Promise<Exit>(() => undefined),
    async terminateTree() { stopped++; return true } } } })
  bridge.bind(binding)
  const running = bridge.draft(request)
  t.mock.timers.tick(60_000)
  await assert.rejects(running, /CANCELLED/u)
  assert.equal(stopped, 1)
})
test('unknown startup poisons runner instead of risking another child', async () => {
  const bridge = new DraftBridge({ start() { throw new Error('startup ambiguous') } })
  bridge.bind(binding)
  await assert.rejects(bridge.draft(request), /START_UNKNOWN/u)
  await assert.rejects(bridge.draft(request), /TERMINATION_UNCONFIRMED/u)
})
test('cleanup rejection takes precedence over cancellation and permanently blocks launch', async () => {
  const bridge = new DraftBridge({ start() { return { completion: new Promise<Exit>(() => undefined),
    async terminateTree() { throw new Error('OS cleanup failed') } } } })
  bridge.bind(binding)
  const running = bridge.draft(request)
  bridge.cancel()
  await assert.rejects(running, /TERMINATION_UNCONFIRMED/u)
  await assert.rejects(bridge.draft(request), /TERMINATION_UNCONFIRMED/u)
})
test('empty output chunks do not retain buffers or consume the output allowance', async () => {
  let copies = 0
  const empty = new Uint8Array(0)
  empty.slice = () => { copies++; return new Uint8Array(0) }
  const bridge = new DraftBridge({ start(_provider, _input, output) {
    for (let index = 0; index < 1000; index++) output(empty)
    output(encoded)
    return { completion: Promise.resolve('success'), async terminateTree() { return true } }
  } })
  bridge.bind(binding)
  assert.equal((await bridge.draft(request)).draft.body, 'Hello back')
  assert.equal(copies, 0)
})
