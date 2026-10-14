import { constants } from 'node:fs';
import { open, lstat, realpath, unlink, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

const factsSchema = z.strictObject({
  drafts: z.array(z.strictObject({ id: z.uuid(), version: z.number().int().min(1).max(2147483647),
    state: z.enum(['editable', 'consumed']) })).max(1),
  operations: z.array(z.strictObject({ operation_id: z.uuid(), outcome: z.enum(['applied', 'conflict', 'expired']),
    version: z.number().int().min(0).max(2147483647).nullable() })).max(1),
});
const resultSchema = z.strictObject({ schema_version: z.literal(1), request_id: z.uuid(),
  phase: z.enum(['before', 'after']), request_sha256: z.string().regex(/^[0-9a-f]{64}$/), facts: factsSchema });
const bindingSchema = z.strictObject({ nonce: z.string().regex(/^[0-9a-f]{64}$/) });

async function readPrivate(path: string): Promise<string> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600
      || stat.nlink !== 1 || stat.size < 1 || stat.size > 16384) throw new Error('Observer frame invalid');
    return await file.readFile('utf8');
  } finally { await file.close(); }
}

// AIDEV-NOTE: Node test control contains no SQL credential; Soren's trusted runner invokes the isolated Ruby observer.
export async function observeDraft(draftId: string, operationId: string | null,
  phase: 'before' | 'after'): Promise<z.infer<typeof factsSchema>> {
  z.uuid().parse(draftId);
  z.uuid().nullable().parse(operationId);
  const directory = await lstat('/observer-control');
  if (!directory.isDirectory() || directory.uid !== process.getuid?.() || (directory.mode & 0o777) !== 0o700
    || await realpath('/observer-control') !== '/observer-control') throw new Error('Observer control unavailable');
  const { nonce } = bindingSchema.parse(JSON.parse(await readPrivate('/observer-control/binding.json')) as unknown);
  const request = { schema_version: 1, request_id: randomUUID(), nonce, draft_id: draftId, operation_id: operationId, phase };
  const bytes = JSON.stringify(request);
  const frame = await open('/observer-control/request.tmp', constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try { await frame.writeFile(bytes); await frame.sync(); }
  finally { await frame.close(); }
  // One worker and one unacknowledged request are mandatory; the trusted runner atomically removes each frame.
  try { await lstat('/observer-control/request.json'); throw new Error('Observer frame already pending'); }
  catch (error: unknown) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  await rename('/observer-control/request.tmp', '/observer-control/request.json');
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const result = resultSchema.parse(JSON.parse(await readPrivate('/observer-control/result.json')) as unknown);
      if (result.request_id !== request.request_id || result.phase !== phase
        || result.request_sha256 !== createHash('sha256').update(bytes).digest('hex')) throw new Error('Observer proof mismatch');
      while (Date.now() < deadline) {
        try { await lstat('/observer-control/request.json'); }
        catch (error: unknown) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') break;
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      if (Date.now() >= deadline) throw new Error('Observer acknowledgment deadline exceeded');
      await unlink('/observer-control/result.json');
      return result.facts;
    } catch (error: unknown) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw new Error('Observer proof invalid');
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Observer proof deadline exceeded');
}
