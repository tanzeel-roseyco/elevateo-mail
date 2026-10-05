import { authorizeName, fingerprint, recordSchema } from './plan';
import type { DnsRecord } from './plan';
// AIDEV-NOTE: Separate read-only token boundary; no mail-worker imports or mutation methods belong here.
export async function readDnsRecord(owner: string, grant: unknown, expected: DnsRecord, token: string, fetcher: typeof fetch = fetch): Promise<DnsRecord> {
  const record = recordSchema.parse(expected);
  const scope = authorizeName(owner, grant, record.name);
  if (!/^[A-Za-z0-9_-]{20,512}$/.test(token)) throw new Error('dns_config_invalid');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetcher(`https://api.cloudflare.com/client/v4/zones/${scope.zoneId}/dns_records/${record.id}`, {
      method: 'GET', headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error('invalid_response');
    const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 16_384) { await reader.cancel(); throw new Error('response_limit'); }
      if (part.value.byteLength) parts.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!body || typeof body !== 'object' || !('success' in body) || body.success !== true || !('result' in body)
      || !body.result || typeof body.result !== 'object') throw new Error('invalid_response');
    const r = body.result as Record<string, unknown>;
    const current = recordSchema.parse({ id: r.id, name: r.name, type: r.type, content: r.content, ttl: r.ttl,
      proxied: r.proxied ?? false, ...(r.type === 'MX' ? { priority: r.priority } : {}) });
    if (current.id !== record.id || current.name !== record.name || current.type !== record.type) throw new Error('identity_changed');
    return current;
  } catch { throw new Error('dns_read_unavailable'); }
  finally { clearTimeout(timer); }
}
export async function recheckDnsBaseline(owner: string, grant: unknown, baseline: DnsRecord, token: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  return fingerprint(await readDnsRecord(owner, grant, baseline, token, fetcher)) === fingerprint(recordSchema.parse(baseline));
}
