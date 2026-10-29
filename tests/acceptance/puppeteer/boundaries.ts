import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { actorAliases } from '../shared/schema.js';

// AIDEV-NOTE: Only root's private HTTP topology and explicit browser tuple may receive synthetic credentials.
const version = z.string().regex(/^\d{1,3}\.\d{1,5}\.\d{1,5}\.\d{1,5}(?![\s\S])/);
const settings = z.strictObject({ origin: z.literal('http://app.test'),
  executable: z.string().min(1).max(4096).refine(v => isAbsolute(v) && !/[\0\r\n]/.test(v)),
  version, uid: z.number().int().positive() });
export function parseSettings(input: unknown): z.infer<typeof settings> {
  const parsed = settings.safeParse(input);
  if (!parsed.success) throw new Error('Invalid Puppeteer configuration');
  return parsed.data;
}
export function verifyVersion(actual: string, expected: string): void {
  if (!version.safeParse(expected).success || !['Chrome/', 'HeadlessChrome/'].some(p => actual === p + expected))
    throw new Error('Browser version mismatch');
}
const password = z.string().min(12).max(256).refine(v => v.trim().length > 0);
const credentials = z.strictObject({ schema_version: z.literal(1), passwords:
  z.strictObject(Object.fromEntries(actorAliases.map(alias => [alias, password])) as
    Record<typeof actorAliases[number], typeof password>) });
export function parseCredentials(input: unknown): z.infer<typeof credentials> {
  const parsed = credentials.safeParse(input);
  if (!parsed.success) throw new Error('Invalid acceptance credentials');
  return parsed.data;
}
export function draftIdFromURL(value: string, mailbox: string): string {
  const parsed = new URL(value);
  const prefix = `#/mailboxes/${mailbox}/drafts/`;
  const id = parsed.hash.slice(prefix.length);
  if (parsed.origin !== 'http://app.test' || parsed.username || parsed.password || parsed.pathname !== '/'
    || parsed.search || !parsed.hash.startsWith(prefix) || !z.uuid().safeParse(id).success)
    throw new Error('Invalid draft location');
  return id;
}
