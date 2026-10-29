import { type Invoke } from "./protocol.js";

// AIDEV-NOTE: Fixed origin/path and disabled redirects prevent grants escaping to caller-controlled URLs.
export function backend(origin: string): Invoke {
  const url = new URL(origin);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      !(url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "launch-api"))) {
    throw new Error("Invalid backend origin");
  }
  return async (operation, arguments_, token) => {
    if (!["search", "read", "draft"].includes(operation)) throw new Error("Invalid operation");
    const response = await fetch(new URL(`/v2/connector/${operation}`, url), {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(arguments_),
    });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("application/json")) {
      await response.body?.cancel();
      throw new Error("Backend denied request");
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Missing response");
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 4 * 1024 * 1024) throw new Error("Response too large");
        chunks.push(next.value);
      }
    } finally { await reader.cancel(); }
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return result;
  };
}
