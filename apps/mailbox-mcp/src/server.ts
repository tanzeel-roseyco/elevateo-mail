import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { Protocol } from "./protocol.js";
import { backend } from "./backend.js";

const MAX_BODY = 256 * 1024;
const MAX_ACTIVE = 16;
export function server(protocol: Protocol, host: string) {
  let active = 0;
  function reply(response: ServerResponse, status: number, value?: unknown): void {
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(value === undefined ? undefined : JSON.stringify(value));
  }
  async function request(input: IncomingMessage, output: ServerResponse): Promise<void> {
    if (input.headers.origin !== undefined || input.headers.host !== host) return reply(output, 403);
    if (input.url === "/health" && input.method === "GET") return reply(output, 200, { status: "ok" });
    if (input.url !== "/mcp") return reply(output, 404);
    if (input.method !== "POST") return reply(output, 405);
    const authorization = input.headers.authorization;
    if (!authorization || !/^Bearer [A-Za-z0-9_-]{32,256}$/.test(authorization)) return reply(output, 401);
    const version = input.headers["mcp-protocol-version"];
    if (version !== undefined && version !== "2025-11-25") return reply(output, 400);
    if (input.headers["content-type"]?.split(";")[0] !== "application/json" || input.headers["content-encoding"]) {
      return reply(output, 415);
    }
    const accept = input.headers.accept ?? "";
    if (!accept.includes("application/json") || !accept.includes("text/event-stream")) return reply(output, 406);
    if (active >= MAX_ACTIVE) return reply(output, 503);
    active++;
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of input.iterator({ destroyOnReturn: false })) {
        const bytes: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        size += bytes.length;
        if (size > MAX_BODY) {
          // AIDEV-NOTE: Finish the 413 before closing; early iterator return must not reset the socket.
          output.setHeader("Connection", "close");
          output.once("finish", () => input.destroy());
          reply(output, 413);
          return;
        }
        chunks.push(bytes);
      }
      let parsed: unknown;
      try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { return reply(output, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON" } }); }
      const result = await protocol.handle(parsed, authorization.slice(7));
      reply(output, result === null ? 202 : 200, result ?? undefined);
    } finally { active--; }
  }
  // AIDEV-NOTE: Reject browser origins, constrain Host, connections and body time; no sessions or permission caches.
  const instance = createServer((input, output) => {
    void request(input, output).catch(() => { if (!output.headersSent) reply(output, 503); else output.destroy(); });
  });
  instance.requestTimeout = 10000;
  instance.headersTimeout = 5000;
  instance.timeout = 10000;
  instance.keepAliveTimeout = 1000;
  instance.maxConnections = 32;
  instance.maxRequestsPerSocket = 100;
  return instance;
}

if (require.main === module) {
  const origin = process.env.ELEVATEO_MCP_BACKEND_ORIGIN;
  const host = process.env.ELEVATEO_MCP_HTTP_HOST;
  if (!origin || !host || !/^[a-zA-Z0-9.-]+(?::[0-9]{1,5})?$/.test(host)) throw new Error("Missing MCP configuration");
  const protocol = new Protocol(resolve(__dirname, "../../../../contracts/v2/completion.openapi.json"), backend(origin));
  server(protocol, host).listen(4713, "0.0.0.0");
}
