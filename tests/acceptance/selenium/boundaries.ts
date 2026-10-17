import { z } from 'zod';

const version = z.string().regex(/^\d+(?:\.\d+){1,3}(?![\s\S])/).max(64);
const configuration = z.strictObject({ grid: z.literal('http://selenium:4444'),
  browser: z.enum(['chrome', 'firefox']), browserVersion: version, driverVersion: version });
export type GridConfig = z.infer<typeof configuration>;
// AIDEV-NOTE: Exact private endpoint and negotiated versions prevent silent local-driver or image drift.
export function gridConfig(env: NodeJS.ProcessEnv): GridConfig {
  const result = configuration.safeParse({ grid: env.SELENIUM_GRID_URL,
    browser: env.SELENIUM_EXPECTED_BROWSER, browserVersion: env.SELENIUM_EXPECTED_BROWSER_VERSION,
    driverVersion: env.SELENIUM_EXPECTED_DRIVER_VERSION });
  if (!result.success) throw new Error('Invalid Selenium configuration');
  return result.data;
}
export function verifyCapabilities(config: GridConfig, get: (key: string) => unknown): string {
  const browser = get('browserName');
  const browserVersion = get('browserVersion');
  const chrome = z.object({ chromedriverVersion: z.string().max(256) }).safeParse(get('chrome'));
  const rawDriver = config.browser === 'chrome' ? (chrome.success ? chrome.data.chromedriverVersion : undefined)
    : get('moz:geckodriverVersion');
  const driver = typeof rawDriver === 'string' ? /^(\d+(?:\.\d+){1,3})(?: \([a-zA-Z0-9 ._/@{}:#+-]*\))?(?![\s\S])/.exec(rawDriver)?.[1] : undefined;
  if (browser !== config.browser || browserVersion !== config.browserVersion || driver !== config.driverVersion)
    throw new Error('Negotiated Selenium capabilities do not match');
  return `W3C ${config.browser} ${config.browserVersion}; driver ${config.driverVersion}`;
}
export function draftIdFromURL(value: string, mailbox: string): string {
  if (value.length > 512 || /[\s\u0000-\u001f\u007f]/.test(value)) throw new Error('Invalid draft route');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Invalid draft route'); }
  const match = /^#\/mailboxes\/([0-9a-f-]{36})\/drafts\/([0-9a-f-]{36})(?:\?new=1)?$/.exec(url.hash);
  if (url.origin !== 'http://app.test' || url.pathname !== '/' || url.search || url.username || url.password
    || match?.[1] !== mailbox || !z.uuid().safeParse(match?.[2]).success) throw new Error('Invalid draft route');
  return match[2]!;
}
