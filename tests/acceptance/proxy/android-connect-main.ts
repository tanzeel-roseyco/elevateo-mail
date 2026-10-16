import { lstatSync } from 'node:fs';
import { createAndroidConnect } from './android-connect.js';

// AIDEV-NOTE: Only the owned shared socket reaches this internal network; no host TCP port is published.
if (process.getuid?.() === 0) throw new Error('Fixture must be unprivileged');
const directory = lstatSync('/relay');
if (!directory.isDirectory() || directory.uid !== process.getuid?.() || (directory.mode & 0o777) !== 0o700)
  throw new Error('Fixture socket directory ownership invalid');
// AIDEV-NOTE: Never unlink a pre-existing socket; collision must fail without disturbing another consumer.
process.umask(0o177);
const proxy = createAndroidConnect();
proxy.server.on('error', () => { process.stderr.write('Android CONNECT startup failed\n'); process.exit(1); });
proxy.server.listen('/relay/edge.sock');
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, proxy.close);
