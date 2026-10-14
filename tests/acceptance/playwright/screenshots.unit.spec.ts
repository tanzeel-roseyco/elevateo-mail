import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, open, readFile, rm, stat, symlink, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { persistScreenshot } from './screenshots.js';

// AIDEV-NOTE: Fresh calls have no shared memory; preexisting files model a replaced worker's durable artifacts.
const first = 'SCN-READ-002-F1-unavailable';
const second = 'SCN-GUI-006-P-1280';
async function fixture(run: (directory: string, privateDir: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'acceptance-screenshots-'));
  const privateDir = join(directory, 'native-private');
  await mkdir(privateDir, { mode: 0o700 });
  try { await run(directory, privateDir); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

for (const phase of ['write', 'sync', 'close'] as const) {
  test(`${phase} failure removes owned target and lock, preserves existing files and permits retry`, async () => {
    await fixture(async (directory, privateDir) => {
      await persistScreenshot(directory, first, Buffer.from('old'), 10);
      const failure = new Error(`injected ${phase} failure`);
      let reached = false;
      let closed = false;
      await assert.rejects(persistScreenshot(directory, second, Buffer.from('new'), 10,
        async (path, flags, mode) => {
          const descriptor = await open(path, flags, mode);
          return {
            async writeFile(bytes) {
              if (phase === 'write') {
                // AIDEV-NOTE: Persist real partial bytes before rejection; a pre-open failure cannot test cleanup.
                await descriptor.writeFile(Buffer.from('n'));
                assert.equal(await readFile(path, 'utf8'), 'n');
                reached = true;
                throw failure;
              }
              await descriptor.writeFile(bytes);
            },
            async sync() {
              if (phase === 'sync') { reached = true; throw failure; }
              await descriptor.sync();
            },
            async close() {
              await descriptor.close();
              closed = true;
              // Close really releases the descriptor before simulating a reported close failure.
              if (phase === 'close') { reached = true; throw failure; }
            },
          };
        }), cause => cause === failure);
      assert.equal(reached, true);
      assert.equal(closed, true);
      await assert.rejects(access(join(privateDir, `${second}.png`)), { code: 'ENOENT' });
      await assert.rejects(access(join(privateDir, '.screenshots.lock')), { code: 'ENOENT' });
      assert.equal(await readFile(join(privateDir, `${first}.png`), 'utf8'), 'old');
      await persistScreenshot(directory, second, Buffer.from('new'), 6);
      assert.equal(await readFile(join(privateDir, `${second}.png`), 'utf8'), 'new');
      assert.equal(await readFile(join(privateDir, `${first}.png`), 'utf8'), 'old');
      await assert.rejects(access(join(privateDir, '.screenshots.lock')), { code: 'ENOENT' });
    });
  });
}
test('replacement helper counts previous screenshot and enforces aggregate before persistence', async () => {
  await fixture(async (directory, privateDir) => {
    await persistScreenshot(directory, first, Buffer.alloc(6), 10);
    // A replacement process needs only these files, not the original helper or a module counter.
    const moduleURL = new URL('./screenshots.js?replacement', import.meta.url).href;
    const replacement = (await import(moduleURL)).persistScreenshot as typeof persistScreenshot;
    await assert.rejects(replacement(directory, second, Buffer.alloc(5), 10), /Screenshot budget exceeded/);
    await assert.rejects(access(join(privateDir, `${second}.png`)));
    await replacement(directory, second, Buffer.alloc(4), 10);
    assert.equal((await stat(join(privateDir, `${second}.png`))).mode & 0o777, 0o600);
    assert.equal((await stat(join(privateDir, `${first}.png`))).size, 6);
    await assert.rejects(access(join(privateDir, '.screenshots.lock')));
  });
});
test('exclusive artifact and lock creation prevent overwrite and concurrent writers', async () => {
  await fixture(async (directory, privateDir) => {
    await persistScreenshot(directory, first, Buffer.from('old'), 100);
    await assert.rejects(persistScreenshot(directory, first, Buffer.from('new'), 100));
    assert.equal(await readFile(join(privateDir, `${first}.png`), 'utf8'), 'old');
    await writeFile(join(privateDir, '.screenshots.lock'), '');
    await assert.rejects(persistScreenshot(directory, second, Buffer.alloc(1), 100));
    await assert.rejects(access(join(privateDir, `${second}.png`)));
  });
});
test('rejects path escape, linked artifact and linked directory without traversal', async () => {
  await fixture(async (directory, privateDir) => {
    await assert.rejects(persistScreenshot(directory, '../escape', Buffer.alloc(1), 100));
    await symlink('/missing-target', join(privateDir, `${first}.png`));
    await assert.rejects(persistScreenshot(directory, second, Buffer.alloc(1), 100), /Invalid screenshot artifact/);
    await assert.rejects(access(join(privateDir, `${second}.png`)));
    await rm(privateDir, { recursive: true });
    await symlink(directory, privateDir, 'dir');
    await assert.rejects(persistScreenshot(directory, second, Buffer.alloc(1), 100), /Invalid screenshot directory/);
  });
});

// AIDEV-NOTE: The real empty-member case must be permitted and remain in the durable aggregate byte budget.
test('empty member screenshot is permitted and included in later writer budget', async () => {
  await fixture(async (directory, privateDir) => {
    const id = 'SCN-READ-001-F1-empty-denied';
    assert.equal(await persistScreenshot(directory, id, Buffer.from('empty'), 8), `native-private/${id}.png`);
    await assert.rejects(persistScreenshot(directory, first, Buffer.from('four'), 8), /Screenshot budget exceeded/);
    assert.equal(await readFile(join(privateDir, `${id}.png`), 'utf8'), 'empty');
    await assert.rejects(access(join(privateDir, `${first}.png`)));
  });
});
