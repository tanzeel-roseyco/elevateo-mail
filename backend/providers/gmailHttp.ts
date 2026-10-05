import type { ProviderFetch } from './http'

type GmailResponse = { status: number; oversized: boolean; body: unknown }
// AIDEV-NOTE: Read-only Gmail can quarantine oversized content; send transports must retain their ambiguity rules.
export async function gmailRequest(fetcher: ProviderFetch, url: string, token: string): Promise<GmailResponse | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetcher(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal, redirect: 'error' })
    const reader = response.body?.getReader()
    if (!reader) return { status: response.status, oversized: false, body: null }
    const chunks: Uint8Array[] = []; let size = 0
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 65_536) {
        await reader.cancel()
        return { status: response.status, oversized: true, body: null }
      }
      chunks.push(chunk.value)
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return { status: response.status, oversized: false,
      body: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown }
  } catch {
    // AIDEV-NOTE: Network/invalid transport failures are retryable, never durable skipped-message issues.
    return null
  } finally { clearTimeout(timeout) }
}
