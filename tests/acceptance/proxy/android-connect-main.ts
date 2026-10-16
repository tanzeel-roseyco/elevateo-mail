import { createAndroidConnect } from './android-connect.js';

// AIDEV-NOTE: Docker publishes this fixture port on fleet loopback only, reached through the owned SSH tunnel.
if (process.getuid?.() === 0) throw new Error('Fixture must be unprivileged');
const proxy = createAndroidConnect();
proxy.server.on('error', () => { process.stderr.write('Android CONNECT startup failed\n'); process.exit(1); });
proxy.server.listen(19443, '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, proxy.close);
