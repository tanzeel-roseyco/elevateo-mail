import { dirname, basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { types } from 'node:util';
import { z, ZodError } from 'zod';

// AIDEV-NOTE: Frozen source bounds must be reviewed when these files change; never publish stack text.
const sourceLines = {
  'auth-invite.e2e.ts': 79,
  'invitation.ts': 73,
  'auth-stale.e2e.ts': 32,
  'auth-transport.e2e.ts': 54,
  'auth.e2e.ts': 72,
  'boundaries.ts': 43,
  'cases.ts': 22,
  'credential-origin.ts': 16,
  'draft-conflict.e2e.ts': 145,
  'draft-privacy.e2e.ts': 107,
  'draft-recovery-support.ts': 80,
  'draft-recovery.e2e.ts': 83,
  'draft-unapplied.e2e.ts': 117,
  'draft-uncertain-reload.e2e.ts': 124,
  'draft.e2e.ts': 56,
  'observer.ts': 78,
  'read-empty.e2e.ts': 57,
  'read-literal.e2e.ts': 100,
  'read-revocation.e2e.ts': 188,
  'read.e2e.ts': 97,
  'qa816-assignee-ui.e2e.ts': 79,
  'qa816-attachment-ui.e2e.ts': 97,
  'qa816-feature-wave.e2e.ts': 46,
  'qa816-matrix.e2e.ts': 266,
  'qa816-outreach.e2e.ts': 110,
  'screenshots.ts': 83,
  'support.ts': 60,
  'transport-barrier.ts': 64,
} as const;
const files = ['auth-invite.e2e.ts', 'invitation.ts', 'auth-stale.e2e.ts', 'auth-transport.e2e.ts', 'auth.e2e.ts', 'boundaries.ts', 'cases.ts', 'credential-origin.ts', 'draft-conflict.e2e.ts', 'draft-privacy.e2e.ts', 'draft-recovery-support.ts', 'draft-recovery.e2e.ts', 'draft-unapplied.e2e.ts', 'draft-uncertain-reload.e2e.ts', 'draft.e2e.ts', 'observer.ts', 'read-empty.e2e.ts', 'read-literal.e2e.ts', 'read-revocation.e2e.ts', 'read.e2e.ts', 'qa816-assignee-ui.e2e.ts', 'qa816-attachment-ui.e2e.ts', 'qa816-feature-wave.e2e.ts', 'qa816-matrix.e2e.ts', 'qa816-outreach.e2e.ts', 'screenshots.ts', 'support.ts', 'transport-barrier.ts'] as const;
// AIDEV-NOTE: Node 24 uses a native stack accessor; only this intrinsic getter may be invoked.
const nativeStackGetter = Object.getOwnPropertyDescriptor(new Error(), 'stack')?.get;
// AIDEV-NOTE: Only the unchanged toolchain formatter may map native frames; reject later replacement hooks.
const initialStackFormatter = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace');
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const parent = dirname(moduleDirectory);
const sourceDirectory = resolve(basename(parent) === 'dist' ? dirname(parent) : parent, 'playwright');
export const diagnosticSchema = z.strictObject({
  category: z.enum(['unknown', 'error', 'type', 'validation', 'empty-assertions']),
  phase: z.enum(['body', 'cleanup', 'framework']),
  source: z.strictObject({ file: z.enum(files), line: z.number().int().min(1),
    column: z.number().int().min(1).max(1000) }).refine(value => value.line <= sourceLines[value.file]).nullable(),
});
export type Diagnostic = z.infer<typeof diagnosticSchema>;

function sourceLocation(stack: unknown, message: unknown): Diagnostic['source'] {
  if (typeof stack !== 'string' || stack.length > 32768) return null;
  if (typeof message !== 'string' || message.length > 16384) return null;
  // AIDEV-NOTE: Strip the complete message, including multiline payloads, before interpreting native frames.
  const prefix = ['Error', 'TypeError', 'ZodError', 'TimeoutError'].map(name => `${name}: ${message}\n`)
    .find(value => stack.startsWith(value));
  if (!prefix) return null;
  for (const frame of stack.slice(prefix.length).split('\n').slice(0, 64)) {
    if (frame.length > 2048) continue;
    const match = /^\s+at (?:[^()\r\n]{1,200} \()?([^()\r\n]+):(\d{1,6}):(\d{1,4})\)?$/.exec(frame);
    if (!match) continue;
    // AIDEV-NOTE: Native ESM frames use file URLs; compare canonical paths/URLs without decoding untrusted input.
    const file = files.find(name => match[1] === resolve(sourceDirectory, name)
      || match[1] === pathToFileURL(resolve(sourceDirectory, name)).href);
    if (!file) continue;
    const source = { file, line: Number(match[2]), column: Number(match[3]) };
    const checked = diagnosticSchema.safeParse({ category: 'unknown', phase: 'body', source });
    if (checked.success) return checked.data.source;
  }
  return null;
}
// AIDEV-NOTE: Lazy native formatting reads effective name/message and the global prepareStackTrace hook.
function safeDataProperty(object: object, key: string): PropertyDescriptor | null | undefined {
  let current: object | null = object;
  for (let depth = 0; current !== null && depth < 8; depth++) {
    if (types.isProxy(current)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) return 'value' in descriptor ? descriptor : null;
    current = Object.getPrototypeOf(current);
  }
  return current === null ? undefined : null;
}
function safeNativeFormatting(error: Error): boolean {
  for (const key of ['name', 'message']) {
    const descriptor = safeDataProperty(error, key);
    if (descriptor === null || (descriptor && typeof descriptor.value !== 'string'
      && descriptor.value !== undefined)) return false;
  }
  const hook = safeDataProperty(Error, 'prepareStackTrace');
  if (hook === null) return false;
  const ownHook = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace');
  if (!ownHook) return hook === undefined && initialStackFormatter === undefined;
  return initialStackFormatter !== undefined && 'value' in initialStackFormatter
    && 'value' in ownHook && ownHook.value === initialStackFormatter.value
    && ownHook.writable === initialStackFormatter.writable
    && ownHook.enumerable === initialStackFormatter.enumerable
    && ownHook.configurable === initialStackFormatter.configurable
    && (ownHook.value === undefined || (typeof ownHook.value === 'function' && ownHook.configurable === true));
}
export function captureDiagnostic(error: unknown): Diagnostic {
  let category: Diagnostic['category'] = 'unknown';
  let source: Diagnostic['source'] = null;
  // AIDEV-NOTE: Arbitrary thrown objects/getters are not trusted Error or serialized framework diagnostics.
  try {
    if (!types.isProxy(error) && error instanceof Error) {
      const prototype: unknown = Object.getPrototypeOf(error);
      if (prototype === TypeError.prototype) category = 'type';
      else if (error instanceof ZodError) category = 'validation';
      else if (prototype === Error.prototype) category = 'error';
      const stack = Object.getOwnPropertyDescriptor(error, 'stack');
      let stackValue: unknown = stack?.value;
      if (stack?.get && stack.get === nativeStackGetter && safeNativeFormatting(error))
        // AIDEV-NOTE: Keep trusted source-map formatting; native generated offsets are not source coordinates.
        stackValue = Reflect.apply(stack.get, error, []);
      source = sourceLocation(stackValue,
        Object.getOwnPropertyDescriptor(error, 'message')?.value);
    }
  } catch { /* Hostile proxies remain unknown without reading their message. */ }
  const cleanup = source?.file === 'draft-conflict.e2e.ts' && source.line >= 140;
  return { category, phase: cleanup ? 'cleanup' : 'body', source };
}
export function frameworkDiagnostic(stack: unknown, message: unknown): Diagnostic {
  return { category: 'unknown', phase: 'framework', source: sourceLocation(stack, message) };
}
export function diagnosticReason(input: unknown): string {
  let parsed: ReturnType<typeof diagnosticSchema.safeParse>;
  try { parsed = diagnosticSchema.safeParse(input); }
  catch { return 'Acceptance failure: unknown diagnostic'; }
  if (!parsed.success) return 'Acceptance failure: unknown diagnostic';
  const { category, phase, source } = parsed.data;
  return `Acceptance failure: ${phase}/${category}` + (source
    ? ` at tests/acceptance/playwright/${source.file}:${source.line}:${source.column}` : ' at unknown source');
}
export async function runCaseBody(body: () => Promise<void>, assertions: string[]): Promise<Diagnostic | null> {
  try {
    await body();
    return assertions.length ? null : { category: 'empty-assertions', phase: 'body', source: null };
  } catch (error: unknown) { return captureDiagnostic(error); }
}
