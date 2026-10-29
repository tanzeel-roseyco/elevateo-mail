import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { resolve } from "node:path";
import { request } from "node:http";
import { server } from "../src/server.js";
import { serveStream } from "../src/stdio.js";
import { Protocol } from "../src/protocol.js";
const protocol = () => new Protocol(resolve(__dirname, "../../../../contracts/v2/completion.openapi.json"), async () => assert.fail("no tool calls"));
const ping = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });
// AIDEV-NOTE: Native fetch owns Host in Node 24; raw HTTP tests the server's exact authority boundary.
function fetch(url: string, options: { method?: string; headers: Record<string, string>; body?: string }) {
  return new Promise<{ status: number; json: () => Promise<unknown> }>((resolveResponse, reject) => {
    const outbound = request(url, { method: options.method ?? "GET", headers: options.headers }, response => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => resolveResponse({ status: response.statusCode ?? 0,
        json: async () => JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown }));
    });
    outbound.on("error", reject);
    outbound.end(options.body);
  });
}
// AIDEV-NOTE: Loopback exists only inside the final test container; no host API is contacted.
test("HTTP transport enforces headers and framing", async () => {
  const app = server(protocol(), "mcp.test");
  await new Promise<void>(done => app.listen(0, "127.0.0.1", done));
  const address = app.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/mcp`;
  const headers = { Host: "mcp.test", Authorization: `Bearer ${"a".repeat(64)}`,
    "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  try {
    const response = await fetch(url, { method: "POST", headers, body: ping });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { jsonrpc: "2.0", id: 1, result: {} });
    for (const [key, value, expected] of [["Origin", "https://attacker.example", 403], ["Host", "attacker.example", 403],
      ["Authorization", "Bearer bad", 401], ["Content-Type", "text/plain", 415], ["Accept", "text/plain", 406],
      ["mcp-protocol-version", "invalid", 400]] as const) {
      assert.equal((await fetch(url, { method: "POST", headers: { ...headers, [key]: value }, body: ping })).status, expected);
    }
    assert.equal((await fetch(url, { method: "POST", headers, body: "{" })).status, 400);
    assert.equal((await fetch(url, { method: "POST", headers, body: "x".repeat(256 * 1024 + 1) })).status, 413);
    assert.equal((await fetch(url, { headers })).status, 405);
    assert.equal((await fetch(url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) })).status, 202);
  } finally { app.closeAllConnections(); await new Promise<void>((done, reject) => app.close(error => error ? reject(error) : done())); }
});
test("stdio frames fragmented requests and backpressures malformed responses", async () => {
  const chunks: string[] = []; let inFlight = 0; let maximum = 0;
  const output = new Writable({ highWaterMark: 1, write(chunk: Buffer, _encoding, callback) {
    inFlight++; maximum = Math.max(maximum, inFlight); chunks.push(chunk.toString());
    setTimeout(() => { inFlight--; callback(); }, 2);
  } });
  await serveStream(Readable.from([ping.slice(0, 10), ping.slice(10) + "\n" + "{\n".repeat(100)]), output, protocol(), "a".repeat(64));
  assert.equal(chunks.length, 101); assert.equal(maximum, 1); assert.equal(output.writableLength, 0);
  assert.deepEqual(JSON.parse(chunks[0]!), { jsonrpc: "2.0", id: 1, result: {} });
});
test("stdio rejects oversized and unterminated frames", async () => {
  for (const frame of ["x".repeat(256 * 1024 + 1), "x".repeat(256 * 1024 + 1) + "\n", ping]) {
    await assert.rejects(serveStream(Readable.from([frame]), new Writable({ write(_c, _e, done) { done(); } }), protocol(), "a".repeat(64)));
  }
});
