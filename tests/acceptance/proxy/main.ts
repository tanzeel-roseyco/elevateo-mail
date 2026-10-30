import { readFileSync } from 'node:fs';
import { createAcceptanceServer } from './server.js';

// AIDEV-NOTE: Fail closed if root's Docker network namespace cannot bind port 80 without privileges.
try {
  const firstPort = Number(readFileSync('/proc/sys/net/ipv4/ip_unprivileged_port_start', 'utf8').trim());
  if (process.getuid?.() === 0 || !Number.isInteger(firstPort) || firstPort > 80 || firstPort < 0)
    throw new Error('Invalid private runtime');
  const server = createAcceptanceServer('/srv/web');
  server.on('error', () => { process.stderr.write('Acceptance proxy startup failed\n'); process.exit(1); });
  server.listen(80, '0.0.0.0');
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => {
    server.close();
    server.closeAllConnections();
  });
} catch {
  process.stderr.write('Acceptance proxy configuration failed\n');
  process.exitCode = 1;
}
