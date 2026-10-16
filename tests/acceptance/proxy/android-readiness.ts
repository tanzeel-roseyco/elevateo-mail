import { setTimeout as delay } from 'node:timers/promises';
import { checkReadiness, ReadinessError } from './readiness.js';
// AIDEV-NOTE: NODE_EXTRA_CA_CERTS supplies only the APK-bound public QA CA; TLS verification stays enabled.
const end = performance.now() + 60000;
try {
  for (;;) {
    try { await checkReadiness(new URL('https://elevateo.qa.internal')); break; }
    catch (error) {
      if (!(error instanceof ReadinessError) || !error.retryable || performance.now() >= end) throw error;
      await delay(500);
    }
  }
} catch (error) {
  process.stderr.write(error instanceof ReadinessError ? `${error.message}\n` : 'READINESS:android:failed\n');
  process.exitCode = 1;
}
