import { ReadinessError, waitForReadiness } from './readiness.js';

// AIDEV-NOTE: This preflight exits before any browser scenario; it cannot turn failed routing into a skipped case.
if (process.argv.length !== 3 || !['app', 'grid'].includes(process.argv[2] ?? '')) {
  process.stderr.write('READINESS:configuration:invalid\n');
  process.exitCode = 2;
} else {
  try { await waitForReadiness(process.argv[2] === 'grid'); }
  catch (error) {
    process.stderr.write(`${error instanceof ReadinessError ? error.message : 'READINESS:internal:failed'}\n`);
    process.exitCode = 1;
  }
}
