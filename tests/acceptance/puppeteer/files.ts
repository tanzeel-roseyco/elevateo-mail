import { constants, closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCredentials } from './boundaries.js';

// AIDEV-NOTE: Linux O_NOFOLLOW and canonical ancestors fail closed before any credential read or browser launch.
export function validateExecutable(path: string): void {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || realpathSync(path) !== resolve(path) || (stat.mode & 0o111) === 0)
      throw new Error('Invalid executable');
  } catch { throw new Error('Browser executable unavailable or invalid'); }
}
export function loadCredentials(): ReturnType<typeof parseCredentials> {
  const path = '/run/secrets/acceptance-credentials.json';
  let fd: number | undefined;
  try {
    if (realpathSync(path) !== path) throw new Error('Invalid secret mount');
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size < 1 || stat.size > 16384) throw new Error('Invalid secret size');
    const bytes = Buffer.alloc(16385);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length > 16384) throw new Error('Invalid secret size');
    return parseCredentials(JSON.parse(bytes.subarray(0, length).toString('utf8')) as unknown);
  } catch { throw new Error('Acceptance credentials unavailable or invalid'); }
  finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { throw new Error('Credential resource cleanup failed'); }
    }
  }
}
