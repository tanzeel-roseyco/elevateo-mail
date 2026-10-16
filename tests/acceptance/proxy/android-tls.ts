import { createServer } from 'node:https';
import { createSecureContext, TLSSocket } from 'node:tls';
import { ANDROID_EDGE } from './edge-profile.js';
import { acceptanceHandler, boundServer } from './server.js';
import { safeError } from './static.js';

// AIDEV-NOTE: Trust comes from the QA APK's domain-scoped CA; no relaxed browser or global trust settings.
export function createAndroidServer(staticRoot: string, certificate: Buffer, key: Buffer,
  upstream = new URL('http://api:3000'), deadlineMs = 15000) {
  const context = createSecureContext({ cert: certificate, key, minVersion: 'TLSv1.2' });
  const handler = acceptanceHandler(staticRoot, upstream, deadlineMs, ANDROID_EDGE);
  const server = createServer({ cert: certificate, key, minVersion: 'TLSv1.2',
    handshakeTimeout: 5000, maxHeaderSize: 16384, requestTimeout: deadlineMs,
    headersTimeout: deadlineMs, keepAliveTimeout: 1000,
    SNICallback: (name, callback) => name === ANDROID_EDGE.host
      ? callback(null, context) : callback(new Error('Rejected fixture identity')),
  }, (input, output) => {
    if (!(input.socket instanceof TLSSocket) || input.socket.servername !== ANDROID_EDGE.host) {
      safeError(output, 421); return;
    }
    handler(input, output);
  });
  boundServer(server, deadlineMs);
  server.maxConnections = 16;
  return server;
}
