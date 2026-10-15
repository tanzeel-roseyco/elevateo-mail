import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';
import { transportBarrier } from './transport-barrier.js';

// AIDEV-NOTE: Synthetic bytes make transport errors inspectable without exposing application responses or credentials.
let writes = 0;
const server = createServer((request, response) => {
  if (request.url === '/probe' && request.method === 'PUT') writes += 1;
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end('synthetic transport fixture');
});
test.beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(80, '0.0.0.0', resolve);
  });
});
test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

for (const mode of ['hold-response', 'lose-ack', 'no-forward'] as const) {
  test(`${mode} settles the held request and removes interception`, async ({ page }) => {
    await page.goto('http://app.test');
    const before = writes;
    const barrier = await transportBarrier(page, '/probe', 'PUT', mode);
    const response = page.evaluate(async () => {
      try {
        const result = await fetch('/probe', { method: 'PUT' });
        return { status: result.status, body: await result.text(), failed: false };
      } catch { return { status: null, body: '', failed: true }; }
    });
    expect(await barrier.reached).toBe(mode === 'no-forward' ? null : 200);
    expect(writes - before).toBe(mode === 'no-forward' ? 0 : 1);
    await barrier.close();
    const result = await response;
    expect(result.failed).toBe(mode !== 'hold-response');
    if (mode === 'hold-response') expect(result.body).toBe('synthetic transport fixture');
    await barrier.close();
    // AIDEV-NOTE: A later request must reach the real server after cleanup, regardless of the injected failure mode.
    expect(await page.evaluate(async () => (await fetch('/probe', { method: 'PUT' })).status)).toBe(200);
    expect(writes - before).toBe(mode === 'no-forward' ? 1 : 2);
  });
}
