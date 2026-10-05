import { z } from 'zod'
import { bindingSchema, draftSchema, limits, requestSchema } from './contracts'

const preparationSchema = z.object({
  provider: z.enum(['codex', 'claude']), version: z.string().max(32),
  binding: bindingSchema, authenticatedBinding: bindingSchema,
  policy: z.enum(['verified-no-managed-hooks', 'unknown']),
  account: z.enum(['verified-own-subscription', 'unknown']),
  request: requestSchema,
}).strict()
const schema = JSON.stringify({ type: 'object', additionalProperties: false,
  properties: { subject: { type: 'string', maxLength: 998 }, body: { type: 'string', maxLength: 64000 } },
  required: ['subject', 'body'] })

// AIDEV-NOTE: Preparation is not launch permission; native policy/auth attestation does not exist yet.
export function prepareCliDraft(value: unknown) {
  const input = preparationSchema.parse(value)
  if (input.provider !== 'claude') throw new Error('CODEX_ISOLATION_UNVERIFIED')
  if (input.version !== '2.1.289') throw new Error('UNSUPPORTED_VERSION')
  if (input.policy !== 'verified-no-managed-hooks' || input.account !== 'verified-own-subscription') {
    throw new Error('ISOLATION_UNVERIFIED')
  }
  const { accountId, generation } = input.authenticatedBinding
  if ([input.binding, input.request].some((binding) => binding.accountId !== accountId || binding.generation !== generation)) {
    throw new Error('SESSION_CHANGED')
  }
  const stdin = JSON.stringify(input.request)
  if (new TextEncoder().encode(stdin).byteLength > limits.inputBytes) throw new Error('INPUT_LIMIT')
  return { launchEnabled: false as const, provider: 'claude' as const, stdin,
    // No inherited environment, PATH, home or credentials. A native adapter must supply a verified identity separately.
    env: {} as Readonly<Record<string, string>>,
    args: ['--print', '--safe-mode', '--restricted', '--tools', '', '--disallowedTools', '*',
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--disable-slash-commands',
      '--settings', '{"disableAllHooks":true}', '--permission-prompts', 'none', '--no-session-persistence',
      '--output-format', 'json', '--json-schema', schema] }
}

const resultSchema = z.object({ type: z.literal('result'), subtype: z.literal('success'),
  is_error: z.literal(false), structured_output: draftSchema,
  result: z.string().max(limits.outputBytes).optional(), session_id: z.string().max(128).optional(),
  duration_ms: z.number().nonnegative().optional(), duration_api_ms: z.number().nonnegative().optional(),
  num_turns: z.number().int().nonnegative().optional(), total_cost_usd: z.number().nonnegative().optional(),
}).strict()

// AIDEV-NOTE: Conservative fixture envelope; unsupported metadata fails closed until actual CLI compatibility is proven.
export function parseClaudeDraft(bytes: Uint8Array) {
  if (bytes.byteLength === 0 || bytes.byteLength > limits.outputBytes) throw new Error('OUTPUT_LIMIT')
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const parsed: unknown = JSON.parse(text)
  return resultSchema.parse(parsed).structured_output
}
