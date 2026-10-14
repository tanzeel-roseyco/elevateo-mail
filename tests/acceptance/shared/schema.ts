import { z } from 'zod';

// AIDEV-NOTE: Strict, credential-free wire objects are shared by all lanes; root alone seals aggregate evidence.
export const laneSchema = z.enum(['unit', 'database', 'real_auth_api', 'playwright_real',
  'playwright_mock', 'puppeteer_cdp', 'selenium', 'native_platform']);
export const profileSchema = z.enum(['fixture', 'internal_http', 'tls', 'native']);
export const idSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}(?![\s\S])/);
export const scenarioSchema = z.string().regex(/^SCN-[A-Z][A-Z0-9]{1,19}-\d{3}-(P|F1|F2)(?![\s\S])/);
export const safeText = z.string().min(1).max(2000).regex(/^[^\u0000-\u0008\u000b-\u001f\u007f]*$/)
  .refine(value => value.trim().length > 0);
export const artifactPathSchema = z.string().min(1).max(240).superRefine((value, ctx) => {
  const parts = value.split('/');
  if (parts.some(part => !/^[a-zA-Z0-9][a-zA-Z0-9._-]*(?![\s\S])/.test(part) || /[. ]$/.test(part)
    || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) {
    ctx.addIssue({ code: 'custom', message: 'Expected portable artifact-relative path' });
  }
});
const timestamp = z.iso.datetime({ precision: 3 }).refine(value => Date.parse(value) >= 0);
const attemptId = z.string().min(1).max(160).regex(/^SCN-[A-Z][A-Z0-9]{1,19}-\d{3}-(P|F1|F2)\.[a-z_]+\.[0-9]{1,2}$/);
export const caseResultSchema = z.strictObject({
  schema_version: z.literal(1), run_id: idSchema, dispatch_id: idSchema,
  lane: laneSchema, transport_profile: profileSchema, scenario_path_id: scenarioSchema,
  partition: safeText, framework_test_id: safeText, test_file: artifactPathSchema,
  implementation_mode: z.enum(['real', 'mock', 'simulated']),
  attempt: z.number().int().min(0).max(20), attempt_id: attemptId, retry_of: attemptId.nullable(),
  started_at: timestamp, ended_at: timestamp, duration_ms: z.number().finite().min(0).max(86400000),
  status: z.enum(['passed', 'failed', 'not_run', 'blocked', 'skipped']),
  reason: safeText.nullable(), authority_variant: safeText,
  assertions: z.array(safeText).max(100), evidence: z.array(safeText).max(100),
  artifacts: z.array(artifactPathSchema).max(100),
}).superRefine((value, ctx) => {
  const prefix = `${value.scenario_path_id}.${value.lane}.`;
  const elapsed = Date.parse(value.ended_at) - Date.parse(value.started_at);
  if (elapsed < 0 || elapsed !== value.duration_ms)
    ctx.addIssue({ code: 'custom', message: 'duration_ms must equal end minus start' });
  if (value.attempt_id !== `${prefix}${value.attempt}`
    || value.retry_of !== (value.attempt === 0 ? null : `${prefix}${value.attempt - 1}`))
    ctx.addIssue({ code: 'custom', message: 'Invalid attempt identity or predecessor' });
  if (value.status !== 'passed' && value.reason === null)
    ctx.addIssue({ code: 'custom', message: 'Non-passing records require a reason' });
  if (value.status === 'passed' && value.assertions.length === 0)
    ctx.addIssue({ code: 'custom', message: 'Passing records require an assertion' });
  if (new Set(value.artifacts).size !== value.artifacts.length)
    ctx.addIssue({ code: 'custom', message: 'Duplicate artifact references' });
  if ((value.lane === 'playwright_mock') !== (value.transport_profile === 'fixture')
    && !['unit', 'database'].includes(value.lane))
    ctx.addIssue({ code: 'custom', message: 'Fixture profile cannot claim a real lane' });
  if ((value.lane === 'native_platform') !== (value.transport_profile === 'native'))
    ctx.addIssue({ code: 'custom', message: 'Native profile requires native lane' });
  if (value.implementation_mode === 'mock' && value.transport_profile !== 'fixture')
    ctx.addIssue({ code: 'custom', message: 'Mock results require fixture profile' });
  if (value.implementation_mode === 'real' && value.transport_profile === 'fixture')
    ctx.addIssue({ code: 'custom', message: 'Fixture results cannot claim real implementation' });
});
export type CaseResult = z.infer<typeof caseResultSchema>;
export const actorAliases = ['manager_primary', 'manager_backup', 'reader', 'composer', 'approver',
  'disabled', 'revoked', 'no_membership', 'other_org'] as const;
const uuid = z.uuid();
const actorSchema = z.strictObject({
  user_id: uuid, email: z.string().max(254).regex(/^[a-z0-9_]+@(?:[a-z0-9-]+\.)+test(?![\s\S])/),
  organization: z.enum(['primary', 'other']).nullable(), mailbox: z.enum(['primary', 'other']).nullable(),
  state: z.enum(['active', 'disabled', 'revoked', 'no_membership']),
  capabilities: z.array(z.enum(['manage', 'read', 'compose', 'approve_send'])).max(4),
  authorization_version: z.string().regex(/^[A-Za-z0-9_-]{43}(?![\s\S])/).nullable(),
  // AIDEV-NOTE: BE02 has an internal authorization generation, but no separate per-membership generation contract.
  membership_generation: z.null(),
});
export const seedSchema = z.strictObject({
  schema_version: z.literal(2), kind: z.enum(['example', 'runtime']),
  fixture_variant: z.enum(['base', 'multi_mailbox', 'literal_read']),
  extra_mailboxes: z.strictObject({ secondary: uuid.optional(), excluded: uuid.optional() }),
  literal_threads: z.strictObject({ read_empty: uuid.optional(), read_literal: uuid.optional() }),
  fixture_identity: z.strictObject({ run_id: idSchema, dispatch_id: idSchema,
    case_id: z.union([scenarioSchema, z.literal('shared-diagnostic')]),
    engine: z.enum(['chromium', 'firefox', 'webkit', 'chrome']), attempt: z.number().int().min(0).max(20),
    dataset_id: uuid, nonce: z.string().regex(/^[0-9a-f]{64}$/) }),
  expected_mailbox_memberships: z.record(z.enum(actorAliases), z.array(z.strictObject({ mailbox_id: uuid,
    capabilities: z.array(z.enum(['manage', 'read', 'compose', 'approve_send'])).max(4) })).max(2)),
  actors: z.strictObject({ manager_primary: actorSchema, manager_backup: actorSchema, reader: actorSchema,
    composer: actorSchema, approver: actorSchema, disabled: actorSchema, revoked: actorSchema,
    no_membership: actorSchema, other_org: actorSchema }),
  organizations: z.strictObject({ primary: uuid, other: uuid }),
  mailboxes: z.strictObject({ primary: uuid, other: uuid }),
  data: z.strictObject({
    thread_primary: uuid, thread_other: uuid, draft_primary: uuid, draft_other: uuid,
    draft_version: z.number().int().min(1).max(2147483647),
    ordered_at: timestamp, marker: z.string().regex(/^ACCEPTANCE_[A-Z0-9_]{1,64}(?![\s\S])/),
  }),
}).superRefine((value, ctx) => {
  const actors = Object.values(value.actors);
  const boxKeys = Object.keys(value.extra_mailboxes).sort().join(',');
  const threadKeys = Object.keys(value.literal_threads).sort().join(',');
  if (boxKeys !== (value.fixture_variant === 'multi_mailbox' ? 'excluded,secondary' : '')
    || threadKeys !== (value.fixture_variant === 'literal_read' ? 'read_empty,read_literal' : ''))
    ctx.addIssue({ code: 'custom', message: 'Fixture variant resources mismatch' });
  const ids = [...actors.map(actor => actor.user_id), ...Object.values(value.organizations),
    ...Object.values(value.mailboxes), value.data.thread_primary, value.data.thread_other,
    value.data.draft_primary, value.data.draft_other, value.fixture_identity.dataset_id,
    ...Object.values(value.extra_mailboxes), ...Object.values(value.literal_threads)];
  if (new Set(ids).size !== ids.length || new Set(actors.map(actor => actor.email)).size !== 9)
    ctx.addIssue({ code: 'custom', message: 'Seed identities must be unique' });
  for (const alias of actorAliases) {
    const actor = value.actors[alias];
    const scope = alias === 'other_org' ? 'other' : alias === 'no_membership' ? null : 'primary';
    const state = ['disabled', 'revoked', 'no_membership'].includes(alias) ? alias : 'active';
    const capabilities = alias.startsWith('manager_') ? ['manage', 'read', 'compose', 'approve_send']
      : alias === 'reader' || alias === 'other_org' ? ['read'] : alias === 'composer' ? ['read', 'compose']
      : alias === 'approver' ? ['read', 'compose', 'approve_send'] : [];
    const cannotEnterSession = alias === 'disabled' || alias === 'no_membership';
    const expected = capabilities.length === 0 ? [] : [{ mailbox_id: value.mailboxes[scope ?? 'primary'],
      capabilities: [...capabilities].sort() }];
    if (alias === 'composer' && value.fixture_variant === 'multi_mailbox' && value.extra_mailboxes.secondary)
      expected.push({ mailbox_id: value.extra_mailboxes.secondary, capabilities: ['read'] });
    const memberships = value.expected_mailbox_memberships[alias].map(row => ({ mailbox_id: row.mailbox_id,
      capabilities: [...row.capabilities].sort() })).sort((a, b) => a.mailbox_id.localeCompare(b.mailbox_id));
    expected.sort((a, b) => a.mailbox_id.localeCompare(b.mailbox_id));
    if (JSON.stringify(memberships) !== JSON.stringify(expected))
      ctx.addIssue({ code: 'custom', message: `Fixture membership mismatch: ${alias}` });
    if (actor.organization !== scope || actor.mailbox !== scope || actor.state !== state
      || [...actor.capabilities].sort().join() !== capabilities.sort().join()
      || (actor.authorization_version === null) !== cannotEnterSession)
      ctx.addIssue({ code: 'custom', message: `Actor contract mismatch: ${alias}` });
  }
});
export type SeedContract = z.infer<typeof seedSchema>;
