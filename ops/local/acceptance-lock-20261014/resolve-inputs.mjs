import { copyFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// AIDEV-NOTE: Dependency resolution and official browser hashing run only in a disposable fleet container.
copyFileSync('/input/package.json', '/work/package.json');
execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
  { cwd: '/work', stdio: 'inherit', timeout: 180000 });
copyFileSync('/work/package-lock.json', '/output/package-lock.json');
const url = 'https://storage.googleapis.com/chrome-for-testing-public/155.0.8059.39/linux64/chrome-linux64.zip';
const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
if (!response.ok || response.body === null) throw new Error('Official browser archive unavailable');
const hash = createHash('sha256');
let bytes = 0;
for await (const chunk of response.body) {
  bytes += chunk.byteLength;
  if (bytes > 300 * 1024 * 1024) throw new Error('Browser archive exceeds bound');
  hash.update(chunk);
}
const result = { version: '155.0.8059.39', platform: 'linux64', url, bytes, sha256: hash.digest('hex') };
writeFileSync('/output/browser-archive.json', JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify(result));
