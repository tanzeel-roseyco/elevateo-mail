import { constants, closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { z } from 'zod';
import { atCredentialOrigin } from './credential-origin.js';

const contract = z.strictObject({ version: z.literal(1), link: z.string().min(1).max(4096),
  password: z.string().min(12).max(256).refine(value => value.trim().length > 0),
  actor_id: z.uuid(), organization_id: z.uuid(), mailbox_id: z.uuid() });
export function parseInvitation(input: unknown): z.infer<typeof contract> {
  try {
    const result = contract.safeParse(input);
    if (!result.success) throw new Error();
    const url = new URL(result.data.link);
    if (url.origin !== 'http://app.test' || url.username || url.password || url.hash
      || url.pathname !== '/auth/accept' || url.searchParams.getAll('type').length !== 1
      || url.searchParams.get('type') !== 'invite'
      || url.searchParams.getAll('token').length !== 1
      || !/^[A-Za-z0-9_-]{1,2048}$/.test(url.searchParams.get('token') ?? '')
      || [...url.searchParams.keys()].some(key => !['token', 'type', 'redirect_to'].includes(key))
      || url.searchParams.getAll('redirect_to').length > 1
      || (url.searchParams.has('redirect_to')
        && url.searchParams.get('redirect_to') !== 'http://app.test/auth/complete')) throw new Error();
    return result.data;
  } catch { throw new Error('Acceptance invitation unavailable or invalid'); }
}
export function privateInvitationMetadata(stat: { mode: number; uid: number }, uid: number): boolean {
  return (stat.uid === 0 || stat.uid === uid) && (stat.mode & 0o027) === 0;
}
export function loadInvitation(): ReturnType<typeof parseInvitation> {
  const path = '/run/secrets/acceptance-invitation.json';
  let fd: number | undefined;
  try {
    // AIDEV-NOTE: Trusted canonical ancestors and nofollow/nonblock bound the readonly private mount read.
    if (realpathSync(path) !== path) throw new Error();
    for (const parent of ['/run', '/run/secrets']) {
      const stat = lstatSync(parent);
      if (!stat.isDirectory() || (stat.uid !== 0 && stat.uid !== (process.getuid?.() ?? -1))
        || (stat.mode & 0o022) !== 0) throw new Error();
    }
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile() || !privateInvitationMetadata(stat, (process.getuid?.() ?? -1))
      || stat.size < 1 || stat.size > 8192) throw new Error();
    const bytes = Buffer.alloc(8193);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length > 8192) throw new Error();
    return parseInvitation(JSON.parse(bytes.subarray(0, length).toString('utf8')) as unknown);
  } catch { throw new Error('Acceptance invitation unavailable or invalid'); }
  finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { throw new Error('Invitation resource cleanup failed'); }
    }
  }
}
type PasswordPage = { url(): string;
  getByLabel(label: string, options: { exact: true }): { fill(value: string): Promise<void> } };
export async function fillInvitationPassword(page: PasswordPage, password: string): Promise<void> {
  // AIDEV-NOTE: Sanitize browser command failures too; filled values and selector diagnostics remain private.
  try {
    for (const label of ['New password', 'Confirm password'])
      await atCredentialOrigin(() => page.url(), () => page.getByLabel(label, { exact: true }).fill(password));
  } catch { throw new Error('Invitation password entry failed'); }
}
export function atCompletion(url: string): boolean {
  try { const parsed = new URL(url);
    return parsed.origin === 'http://app.test' && !parsed.username && !parsed.password
      && parsed.pathname === '/auth/complete' && !parsed.search && !parsed.hash;
  } catch { return false; }
}
