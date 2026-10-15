import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { z } from 'zod';
import { captureDiagnostic } from './diagnostics.js';
import { observeDraft } from './observer.js';

// AIDEV-NOTE: Run only in the isolated fleet probe with a task-owned 0700 /observer-control tmpfs.
const directory = '/observer-control';
const draftId = '11111111-1111-4111-8111-111111111111';
const requestSchema = z.object({ request_id: z.uuid() });
async function readRequest(): Promise<{ bytes: string; requestId: string }> {
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      const bytes = await readFile(`${directory}/request.json`, 'utf8');
      return { bytes, requestId: requestSchema.parse(JSON.parse(bytes) as unknown).request_id };
    } catch (error: unknown) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Synthetic observer request missing');
}

test.afterEach(async () => {
  for (const name of ['binding.json', 'request.json', 'request.tmp', 'result.json', 'result.tmp']) {
    try { await unlink(`${directory}/${name}`); }
    catch (error: unknown) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
});

for (const fault of ['none', 'hash', 'request'] as const) {
  test(`native observer preserves source coordinates: ${fault}`, async () => {
    await writeFile(`${directory}/binding.json`, JSON.stringify({ nonce: 'a'.repeat(64) }), { mode: 0o600 });
    const observation = observeDraft(draftId, null, 'before').then(
      facts => ({ ok: true as const, facts }),
      error => ({ ok: false as const, diagnostic: captureDiagnostic(error) }),
    );
    const request = await readRequest();
    const response = {
      schema_version: 1,
      request_id: fault === 'request' ? '22222222-2222-4222-8222-222222222222' : request.requestId,
      phase: 'before',
      request_sha256: fault === 'hash' ? 'b'.repeat(64) : createHash('sha256').update(request.bytes).digest('hex'),
      facts: { drafts: [], operations: [] },
    };
    await writeFile(`${directory}/result.tmp`, JSON.stringify(response), { mode: 0o600 });
    await rename(`${directory}/result.tmp`, `${directory}/result.json`);
    await unlink(`${directory}/request.json`);
    const result = await observation;
    if (fault === 'none') expect(result).toEqual({ ok: true, facts: response.facts });
    else {
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Synthetic invalid proof unexpectedly accepted');
      // AIDEV-NOTE: Native generated offsets differ; the unchanged Playwright formatter must map back to line 51.
      expect(result.diagnostic).toEqual({ category: 'error', phase: 'body',
        source: { file: 'observer.ts', line: 51, column: 94 } });
      expect(JSON.stringify(result)).not.toContain('Observer proof mismatch');
    }
  });
}
