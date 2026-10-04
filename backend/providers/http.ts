// AIDEV-NOTE: Bound provider responses while streaming; timeout or malformed acceptance is always ambiguous.
export type ProviderFetch = (input: string, init: RequestInit) => Promise<Response>;
export async function providerRequest(fetcher: ProviderFetch, url: string, init: RequestInit): Promise<{ status: number; body: unknown } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal, redirect: 'error' });
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 65_536) { await reader.cancel(); return null; }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { status: response.status, body: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown };
  } catch {
    // AIDEV-NOTE: Network errors may contain tokens; return a safe ambiguous result instead of logging them.
    return null;
  } finally { clearTimeout(timeout); }
}
