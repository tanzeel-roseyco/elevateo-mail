import { z } from 'zod'

const headersSchema = z.object({
  id: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/u),
  timestamp: z.string().regex(/^[1-9][0-9]{0,11}$/u),
  signature: z.string().min(1).max(4096),
}).strict()
const secretSchema = z.string().min(6).max(512).regex(/^whsec_[A-Za-z0-9+/]+={0,2}$/u)

function decodeBase64(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(value) || value.length % 4 === 1) return null
  try {
    const decoded = atob(value)
    // AIDEV-NOTE: Accept provider keys with omitted padding, but reject noncanonical or ambiguous encodings.
    if (btoa(decoded).replace(/=+$/u, '') !== value.replace(/=+$/u, '')) return null
    return Uint8Array.from(decoded, character => character.charCodeAt(0))
  } catch { return null }
}

// AIDEV-NOTE: Verify exact raw bytes before JSON parsing; durable event deduplication belongs to the caller.
export async function verifySvix(raw: Uint8Array, headers: unknown, secret: unknown, now = Date.now()): Promise<boolean> {
  const parsed = headersSchema.safeParse(headers)
  const configured = secretSchema.safeParse(secret)
  if (!(raw instanceof Uint8Array) || raw.byteLength > 65_536 || !parsed.success || !configured.success ||
    !Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000) return false
  const { id, timestamp, signature } = parsed.data
  if (Math.abs(now - Number(timestamp) * 1000) > 300_000) return false
  const signatures = signature.split(' ')
  if (signatures.length > 8 || signatures.some(item => !/^v[0-9]{1,3},[A-Za-z0-9+/]+={0,2}$/u.test(item))) return false
  const keyBytes = decodeBase64(configured.data.slice(6))
  if (!keyBytes || keyBytes.byteLength < 16 || keyBytes.byteLength > 128) return false
  const prefix = new TextEncoder().encode(`${id}.${timestamp}.`)
  const content = new Uint8Array(prefix.byteLength + raw.byteLength)
  content.set(prefix)
  content.set(raw, prefix.byteLength)
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  for (const candidate of signatures) {
    if (!candidate.startsWith('v1,')) continue
    const bytes = decodeBase64(candidate.slice(3))
    // AIDEV-NOTE: Web Crypto owns constant-time MAC comparison; never compare encoded signatures as strings.
    if (bytes?.byteLength === 32 && await crypto.subtle.verify('HMAC', key, bytes, content)) return true
  }
  return false
}
