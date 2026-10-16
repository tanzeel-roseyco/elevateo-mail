import { readFileSync } from 'node:fs';
import { createAndroidServer } from './android-tls.js';

// AIDEV-NOTE: Only disposable test certificates are mounted here; the runtime has no private CA signing key.
try {
  if (process.getuid?.() === 0) throw new Error('Fixture must be unprivileged');
  const server = createAndroidServer('/srv/web', readFileSync('/run/android-tls/server.pem'),
    readFileSync('/run/android-tls/server.key'));
  server.on('error', () => { process.stderr.write('Android HTTPS startup failed\n'); process.exit(1); });
  server.listen(443, '0.0.0.0');
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => {
    server.close(); server.closeAllConnections();
  });
} catch {
  process.stderr.write('Android HTTPS configuration failed\n');
  process.exitCode = 1;
}
