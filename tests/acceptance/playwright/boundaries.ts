import { constants, closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { z } from 'zod';
import { actorAliases } from '../shared/schema.js';

const password = z.string().min(12).max(256).refine(value => value.trim().length > 0);
const passwords = z.strictObject(Object.fromEntries(actorAliases.map(alias => [alias, password])) as
  Record<typeof actorAliases[number], typeof password>);
const credentials = z.strictObject({ schema_version: z.literal(1), passwords });
export function parseCredentials(input: unknown): z.infer<typeof credentials> {
  const result = credentials.safeParse(input);
  if (!result.success) throw new Error('Invalid acceptance credentials');
  return result.data;
}
export function loadCredentials(): z.infer<typeof credentials> {
  // AIDEV-NOTE: Open without following links; bound the actual read as well as the initial stat.
  let descriptor: number | undefined;
  try {
    descriptor = openSync('/run/secrets/acceptance-credentials.json', constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > 16384) throw new Error('Invalid credentials');
    const bytes = Buffer.alloc(16385);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(descriptor, bytes, length, bytes.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length > 16384) throw new Error('Invalid credentials');
    return parseCredentials(JSON.parse(bytes.subarray(0, length).toString('utf8')) as unknown);
  } catch { throw new Error('Acceptance credentials unavailable or invalid'); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}
export function browserName(value: string | undefined): 'chromium' | 'firefox' | 'webkit' {
  if (value === undefined) return 'chromium';
  if (value === 'chromium' || value === 'firefox' || value === 'webkit') return value;
  throw new Error('Invalid acceptance browser');
}
export function draftReceipt(input: unknown): { draft_id: string; version: number } {
  const result = z.strictObject({ draft_id: z.uuid(), operation_id: z.uuid(),
    version: z.number().int().positive(), state: z.literal('editable') }).safeParse(input);
  if (!result.success) throw new Error('Invalid draft receipt');
  return { draft_id: result.data.draft_id, version: result.data.version };
}
