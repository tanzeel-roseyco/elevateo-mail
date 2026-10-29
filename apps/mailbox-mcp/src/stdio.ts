import { type Readable, type Writable } from "node:stream";
import { resolve } from "node:path";
import { Protocol } from "./protocol.js";
import { backend } from "./backend.js";

// AIDEV-NOTE: The desktop launcher supplies a short-lived grant via environment, never argv or email content.
async function main(): Promise<void> {
  const origin = process.env.ELEVATEO_MCP_BACKEND_ORIGIN;
  const token = process.env.ELEVATEO_MCP_GRANT;
  if (!origin || !token || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw new Error("Missing MCP configuration");
  const protocol = new Protocol(resolve(__dirname, "../../../../contracts/v2/completion.openapi.json"), backend(origin));
  await serveStream(process.stdin, process.stdout, protocol, token);
}

export async function serveStream(inputStream: Readable, outputStream: Writable, protocol: Protocol, token: string): Promise<void> {
  // AIDEV-NOTE: Await both success and parse-error writes so a stalled reader cannot grow an unbounded queue.
  const write = (value: unknown) => new Promise<void>((done, reject) => outputStream.write(JSON.stringify(value) + "\n", error => error ? reject(error) : done()));
  let pending = Buffer.alloc(0);
  for await (const chunk of inputStream) {
    pending = Buffer.concat([pending, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))]);
    for (;;) {
      const end = pending.indexOf(10);
      if (end < 0) break;
      if (end > 256 * 1024) throw new Error("Request too large");
      const line = pending.subarray(0, end); pending = pending.subarray(end + 1);
      let input: unknown;
      try { input = JSON.parse(line.toString("utf8")); }
      catch { await write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON" } }); continue; }
      const result = await protocol.handle(input, token);
      if (result) await write(result);
    }
    if (pending.length > 256 * 1024) throw new Error("Request too large");
  }
  if (pending.length !== 0) throw new Error("Unterminated request");
}
if (require.main === module) void main().catch(() => { process.stderr.write("Mailbox connector stopped.\n"); process.exitCode = 1; });
