import { link, lstat, open, readdir, readFile, realpath, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadAcceptanceConfig } from './config.js';
import { caseResultSchema } from './schema.js';
import type { CaseResult } from './schema.js';
export type { CaseResult } from './schema.js';

// AIDEV-NOTE: One lane writer serializes records; atomic hard-link publication preserves the first attempt.
let pending: Promise<void> = Promise.resolve();
export function recordCase(result: CaseResult): Promise<void> {
  const parsed = caseResultSchema.safeParse(result);
  if (!parsed.success) return Promise.reject(new Error('Invalid case result'));
  const operation = pending.then(() => writeCase(parsed.data));
  pending = operation.catch(() => undefined); // Keep queue usable; caller still receives every failure.
  return operation;
}
async function writeCase(result: CaseResult): Promise<void> {
  const config = loadAcceptanceConfig();
  if (result.run_id !== config.runId || result.dispatch_id !== config.dispatchId
    || result.lane !== config.lane || result.transport_profile !== config.profile)
    throw new Error('Result does not match configured run/dispatch/lane/profile');
  const directory = join(config.outputDir, 'cases');
  if (!(await lstat(directory)).isDirectory() || await realpath(directory) !== resolve(directory))
    throw new Error('Root must provision canonical cases directory');
  if ((await readdir(directory)).length >= config.limits.records) throw new Error('Record limit reached');
  if (result.retry_of !== null) {
    const previousPath = join(directory, `${result.retry_of}.json`);
    const previousStat = await lstat(previousPath);
    if (!previousStat.isFile() || previousStat.size > config.limits.recordBytes)
      throw new Error('Invalid predecessor file');
    const previous = caseResultSchema.parse(JSON.parse(await readFile(previousPath, 'utf8')) as unknown);
    if (previous.run_id !== result.run_id || previous.dispatch_id !== result.dispatch_id
      || previous.lane !== result.lane || previous.scenario_path_id !== result.scenario_path_id
      || previous.attempt_id !== result.retry_of || previous.transport_profile !== result.transport_profile
      || previous.implementation_mode !== result.implementation_mode || previous.status !== 'failed'
      || previous.partition !== result.partition || previous.framework_test_id !== result.framework_test_id
      || previous.test_file !== result.test_file || previous.authority_variant !== result.authority_variant
      || Date.parse(result.started_at) < Date.parse(previous.ended_at))
      throw new Error('Retry requires matching failed predecessor');
  }
  const body = `${JSON.stringify(result)}\n`;
  if (Buffer.byteLength(body) > config.limits.recordBytes) throw new Error('Record byte limit reached');
  const target = join(directory, `${result.attempt_id}.json`);
  const temporary = join(directory, `.pending-${randomUUID()}`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    try {
      await handle.writeFile(body, 'utf8');
      await handle.sync();
    } finally { await handle.close(); }
    await link(temporary, target);
  }
  finally { await unlink(temporary); }
}
