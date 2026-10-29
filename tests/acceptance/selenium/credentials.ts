import { constants, closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { z } from 'zod';
import { actorAliases } from '../shared/schema.js';

const password = z.string().min(12).max(256).refine(value => value.trim().length > 0);
const schema = z.strictObject({ schema_version: z.literal(1), passwords:
  z.strictObject(Object.fromEntries(actorAliases.map(alias => [alias, password])) as
    Record<typeof actorAliases[number], typeof password>) });
export function parseCredentials(input: unknown): z.infer<typeof schema> {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error('Invalid acceptance credentials');
  return result.data;
}
// AIDEV-NOTE: Bound reads after opening a regular non-symlink file; never surface filesystem or parser errors.
export function loadCredentials(): z.infer<typeof schema> {
  let fd: number | undefined;
  try {
    fd = openSync('/run/secrets/acceptance-credentials.json', constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 16384) throw new Error('Invalid credentials');
    const bytes = Buffer.alloc(16385);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length > 16384) throw new Error('Invalid credentials');
    return parseCredentials(JSON.parse(bytes.subarray(0, length).toString('utf8')) as unknown);
  } catch { throw new Error('Acceptance credentials unavailable or invalid'); }
  finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { throw new Error('Credential resource cleanup failed'); }
    }
  }
}
