import { constants } from 'node:fs';
import { lstat, open, realpath, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// AIDEV-NOTE: Fixed lane artifacts are the durable ledger; worker replacement must not reset the byte budget.
const screenshotIds = ['SCN-READ-001-F1-empty-denied', 'SCN-READ-002-F1-unavailable', 'SCN-GUI-006-P-1280', 'SCN-GUI-006-P-390',
  'SCN-GUI-006-P-1440-light', 'SCN-GUI-006-P-1440-dark', 'SCN-GUI-006-P-375-light', 'SCN-GUI-006-P-375-dark',
  'SCN-GUI-006-P-inbox-1440-light', 'SCN-GUI-006-P-inbox-1440-dark',
  'SCN-GUI-006-P-inbox-375-light', 'SCN-GUI-006-P-inbox-375-dark',
  'SCN-GUI-006-P-search-1440-light', 'SCN-GUI-006-P-search-1440-dark',
  'SCN-GUI-006-P-search-375-light', 'SCN-GUI-006-P-search-375-dark',
  'SCN-DRAFT-001-P-1440-light', 'SCN-DRAFT-001-P-1440-dark',
  'SCN-DRAFT-001-P-375-light', 'SCN-DRAFT-001-P-375-dark'];
// AIDEV-NOTE: Only target opening is injectable so regressions exercise real lock, ledger and cleanup paths.
type OpenTarget = (path: string, flags: number, mode: number) =>
  Promise<Pick<FileHandle, 'writeFile' | 'sync' | 'close'>>;
export async function persistScreenshot(outputDir: string, id: string, bytes: Uint8Array,
  budget: number, openTarget: OpenTarget = open): Promise<string> {
  if (!screenshotIds.includes(id) || !Number.isSafeInteger(budget) || budget < 1)
    throw new Error('Invalid screenshot request');
  const directory = join(outputDir, 'native-private');
  const stat = await lstat(directory);
  if (!stat.isDirectory() || await realpath(directory) !== resolve(directory))
    throw new Error('Invalid screenshot directory');
  const lockPath = join(directory, '.screenshots.lock');
  // AIDEV-NOTE: Unexpected concurrency or a crashed writer fails closed; root owns stale-lock reconciliation.
  const lock = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    let total = bytes.byteLength;
    for (const name of screenshotIds) {
      const existing = await lstat(join(directory, `${name}.png`)).catch((cause: unknown) => {
        if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return undefined;
        throw cause;
      });
      if (existing) {
        if (!existing.isFile() || existing.nlink !== 1) throw new Error('Invalid screenshot artifact');
        total += existing.size;
      }
    }
    if (total > budget) throw new Error('Screenshot budget exceeded');
    const file = `native-private/${id}.png`;
    const target = join(outputDir, file);
    const descriptor = await openTarget(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    try {
      try { await descriptor.writeFile(bytes); await descriptor.sync(); }
      finally { await descriptor.close(); }
    } catch (cause: unknown) {
      // AIDEV-NOTE: Only the file exclusively created by this call may be removed after a partial write.
      await unlink(target);
      throw cause;
    }
    return file;
  } finally {
    try { await lock.close(); }
    finally { await unlink(lockPath); }
  }
}
