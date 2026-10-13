import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import { idSchema, laneSchema, profileSchema, seedSchema } from './schema.js';
export type { SeedContract } from './schema.js';

// AIDEV-NOTE: No output fallback; root provisions one private immutable directory per run/dispatch/lane.
const integerEnv = (fallback: number, maximum: number) => z.preprocess(
  value => value === undefined ? fallback : typeof value === 'string' && /^[1-9]\d*(?![\s\S])/.test(value)
    ? Number(value) : value, z.number().int().min(1).max(maximum));
const absolutePath = z.string().min(1).max(4096).refine(value => isAbsolute(value) && !value.includes('\0'));
const envSchema = z.strictObject({
  baseURL: z.enum(['http://app.test', 'https://app.test', 'http://api:3000']),
  lane: laneSchema, profile: profileSchema, runId: idSchema, dispatchId: idSchema,
  seedPath: absolutePath, outputDir: absolutePath,
  limits: z.strictObject({
    artifactBytes: integerEnv(262144000, 536870912), records: integerEnv(5000, 10000),
    recordBytes: integerEnv(262144, 1048576), timeoutMs: integerEnv(120000, 3600000),
    memoryMiB: integerEnv(3072, 4096), cpus: integerEnv(2, 2), workers: z.literal(1),
  }),
}).superRefine((value, ctx) => {
  const backend = ['unit', 'database', 'real_auth_api'].includes(value.lane);
  if (value.baseURL === 'http://api:3000' && !backend)
    ctx.addIssue({ code: 'custom', message: 'Browser origin must be private app.test' });
  if ((value.profile === 'tls') !== (value.baseURL === 'https://app.test'))
    ctx.addIssue({ code: 'custom', message: 'TLS profile requires trusted HTTPS origin' });
  if ((value.profile === 'native') !== (value.lane === 'native_platform'))
    ctx.addIssue({ code: 'custom', message: 'Native profile/lane mismatch' });
  if ((value.profile === 'fixture') !== (value.lane === 'playwright_mock')
    && !['unit', 'database'].includes(value.lane))
    ctx.addIssue({ code: 'custom', message: 'Fixture profile/lane mismatch' });
});
export type AcceptanceConfig = z.infer<typeof envSchema>;
export function loadAcceptanceConfig(): AcceptanceConfig {
  const env = process.env;
  const parsed = envSchema.safeParse({
    baseURL: env.ACCEPTANCE_BASE_URL, lane: env.ACCEPTANCE_LANE, profile: env.ACCEPTANCE_PROFILE,
    runId: env.ACCEPTANCE_RUN_ID, dispatchId: env.ACCEPTANCE_DISPATCH_ID,
    seedPath: env.ACCEPTANCE_SEED_PATH, outputDir: env.ACCEPTANCE_OUTPUT_DIR,
    limits: {
      artifactBytes: env.ACCEPTANCE_MAX_ARTIFACT_BYTES, records: env.ACCEPTANCE_MAX_RECORDS,
      recordBytes: env.ACCEPTANCE_MAX_RECORD_BYTES, timeoutMs: env.ACCEPTANCE_TIMEOUT_MS,
      memoryMiB: env.ACCEPTANCE_MEMORY_MIB, cpus: env.ACCEPTANCE_CPUS, workers: 1,
    },
  });
  // AIDEV-NOTE: Do not echo rejected environment values; they may accidentally contain credentials.
  if (!parsed.success) throw new Error('Invalid acceptance configuration');
  const config = parsed.data;
  if (!lstatSync(config.outputDir).isDirectory() || realpathSync(config.outputDir) !== resolve(config.outputDir))
    throw new Error('Output must be an existing canonical directory without symlink ancestors');
  return config;
}
export function loadSeedContract(): import('./schema.js').SeedContract {
  const { seedPath } = loadAcceptanceConfig();
  const stat = lstatSync(seedPath);
  if (!stat.isFile() || stat.size > 65536) throw new Error('Seed must be a regular file at most 64 KiB');
  let input: unknown;
  try { input = JSON.parse(readFileSync(seedPath, 'utf8')); }
  catch { throw new Error('Invalid seed JSON'); }
  const parsed = seedSchema.safeParse(input);
  if (!parsed.success || parsed.data.kind !== 'runtime') throw new Error('Invalid runtime seed contract');
  return parsed.data;
}
