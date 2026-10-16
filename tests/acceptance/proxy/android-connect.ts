import { createServer } from 'node:http';
import { connect, Socket } from 'node:net';
import { ANDROID_EDGE } from './edge-profile.js';

const AUTHORITY = `${ANDROID_EDGE.host}:443`;
// AIDEV-NOTE: Destination injection exists only for socket tests; the executable fixes android-web:443.
export function createAndroidConnect(host = 'android-web', port = 443, lifetimeMs = 120000) {
  const sockets = new Set<Socket>();
  const server = createServer({ maxHeaderSize: 16384, requestTimeout: 10000,
    headersTimeout: 10000, keepAliveTimeout: 1000 }, (_input, output) => {
    output.writeHead(405, { connection: 'close', 'content-length': '0' }); output.end();
  });
  server.maxConnections = 16;
  server.setTimeout(10000, socket => socket.destroy());
  server.on('upgrade', (_input, socket) => socket.destroy());
  server.on('clientError', (_error, socket) => socket.destroy());
  server.on('connect', (input, client, head) => {
    // AIDEV-NOTE: Node types allow any Duplex here; idle deadlines require a real TCP or UNIX socket.
    if (!(client instanceof Socket)) { client.destroy(); return; }
    const hostFields = input.rawHeaders.filter((_value, index) => index % 2 === 0)
      .filter(name => name.toLowerCase() === 'host');
    if (input.url !== AUTHORITY || input.headers.host !== AUTHORITY || hostFields.length !== 1
      || input.headers['transfer-encoding'] !== undefined || input.headers['content-length'] !== undefined
      || head.length > 16384) {
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return;
    }
    // AIDEV-NOTE: Hold early TLS bytes until the upstream is connected and both pipe destinations exist.
    client.pause();
    const remote = connect({ host, port });
    sockets.add(client); sockets.add(remote);
    const close = () => { client.destroy(); remote.destroy(); };
    const timer = setTimeout(close, lifetimeMs);
    client.setTimeout(30000, close); remote.setTimeout(5000, close);
    for (const socket of [client, remote]) {
      socket.on('error', close);
      socket.once('close', () => { clearTimeout(timer); sockets.delete(socket); close(); });
    }
    let transferred = head.length;
    const count = (bytes: Buffer) => {
      transferred += bytes.length;
      if (transferred > 16 * 1024 * 1024) close();
    };
    client.on('data', count); remote.on('data', count);
    remote.once('connect', () => {
      remote.setTimeout(30000, close);
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) remote.write(head);
      client.pipe(remote); remote.pipe(client);
    });
  });
  return { server, close: () => { for (const socket of sockets) socket.destroy(); server.close();
    server.closeAllConnections(); } };
}
