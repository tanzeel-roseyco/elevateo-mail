import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prepareCliDraft, parseClaudeDraft } from './cliAdapter'

const binding = { accountId: 'alice', generation: 1 }
const input = { provider: 'claude', version: '2.1.289', binding, authenticatedBinding: binding,
  policy: 'verified-no-managed-hooks', account: 'verified-own-subscription',
  request: { ...binding, taskId: 't', mailboxId: 'm', instruction: 'Draft $(evil)', context: [] } }
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const result = { type: 'result', subtype: 'success', is_error: false,
  structured_output: { subject: 'Hello', body: 'World' } }

test('preparation preserves empty tool argument and keeps mail out of argv/environment; never enables launch', () => {
  const prepared = prepareCliDraft(input)
  assert.equal(prepared.launchEnabled, false)
  assert.equal(prepared.args[prepared.args.indexOf('--tools') + 1], '')
  assert.equal(prepared.args.some((arg) => arg.includes('evil')), false)
  assert.deepEqual(prepared.env, {})
  assert.equal(JSON.parse(prepared.stdin).instruction, input.request.instruction)
})
test('unknown policy, identity, version and Codex fail closed', () => {
  for (const patch of [{ policy: 'unknown' }, { account: 'unknown' }, { version: 'latest' }, { provider: 'codex' }]) {
    assert.throws(() => prepareCliDraft({ ...input, ...patch }))
  }
  assert.throws(() => prepareCliDraft(null))
  assert.throws(() => prepareCliDraft({ ...input, env: { ANTHROPIC_API_KEY: 'not-a-secret' } }))
})
test('account and generation mismatches invalidate preparation', () => {
  assert.throws(() => prepareCliDraft({ ...input, authenticatedBinding: { ...binding, accountId: 'bob' } }), /SESSION_CHANGED/)
  assert.throws(() => prepareCliDraft({ ...input, request: { ...input.request, generation: 2 } }), /SESSION_CHANGED/)
})
test('UTF8 request budget counts bytes rather than characters', () => {
  assert.throws(() => prepareCliDraft({ ...input, request: { ...input.request,
    context: [{ messageId: 'x', trust: 'untrusted-email', text: '😀'.repeat(26000) }] } }), /INPUT_LIMIT/)
})
test('bounded fixture success extracts only subject/body', () => {
  assert.deepEqual(parseClaudeDraft(encode(result)), result.structured_output)
})
test('tool events, provider failure, extra authority and malformed output are rejected', () => {
  for (const value of [null, [], { ...result, type: 'tool_use' }, { ...result, is_error: true },
    { ...result, tool_calls: [] }, { ...result, structured_output: { ...result.structured_output, send: true } }]) {
    assert.throws(() => parseClaudeDraft(encode(value)))
  }
  assert.throws(() => parseClaudeDraft(new TextEncoder().encode('{')))
  assert.throws(() => parseClaudeDraft(new Uint8Array([255])))
  assert.throws(() => parseClaudeDraft(new Uint8Array(0)))
  assert.throws(() => parseClaudeDraft(new Uint8Array(64001)), /OUTPUT_LIMIT/)
})
