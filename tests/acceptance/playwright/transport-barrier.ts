import type { Page, Route, APIResponse } from '@playwright/test';

// AIDEV-NOTE: Hold or lose a real upstream response; never fabricate a successful body or application cookie.
export async function transportBarrier(page: Page, path: string, method: string,
  mode: 'hold-response' | 'lose-ack' | 'no-forward'): Promise<{
    reached: Promise<number | null>; release: () => void; close: () => Promise<void>;
  }> {
  let acknowledge!: (status: number | null) => void;
  let fail!: (error: Error) => void;
  let release!: () => void;
  const reached = new Promise<number | null>((resolve, reject) => { acknowledge = resolve; fail = reject; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = new Set<Promise<void>>();
  let claimed = false;
  let expired = false;
  let handlerFailed = false;
  const deadline = Date.now() + 10000;
  const timer = setTimeout(() => {
    expired = true;
    fail(new Error('Real transport barrier deadline exceeded'));
    release();
  }, 10000);
  // A timeout rejection stays observable to the caller without an unhandled promise on early UI failure.
  void reached.catch(() => undefined);
  const matcher = (url: URL): boolean => url.origin === 'http://app.test' && url.pathname === path;
  const handle = async (route: Route): Promise<void> => {
    if (route.request().method() !== method || claimed) { await route.continue(); return; }
    claimed = true;
    let upstream: APIResponse | undefined;
    try {
      if (mode !== 'no-forward') upstream = await route.fetch({ timeout: Math.max(1, Math.min(8000, deadline - Date.now())), maxRedirects: 0, maxRetries: 0 });
      acknowledge(upstream?.status() ?? null);
      await gate;
      if (expired || mode !== 'hold-response') await route.abort('failed');
      else if (upstream) await route.fulfill({ response: upstream });
      else throw new Error('Real upstream response missing');
    } catch {
      handlerFailed = true;
      fail(new Error('Real transport barrier failed'));
      // A canceled document can legitimately destroy a held route; do not expose request/response diagnostics.
      await route.abort('failed').catch(() => undefined);
    } finally {
      await upstream?.dispose();
    }
  };
  const handler = (route: Route): Promise<void> => {
    const work = handle(route);
    pending.add(work);
    void work.finally(() => pending.delete(work)).catch(() => undefined);
    return work;
  };
  await page.route(matcher, handler);
  return {
    reached, release,
    close: async () => {
      release();
      await page.unroute(matcher, handler);
      await Promise.all([...pending]);
      clearTimeout(timer);
      if (expired || handlerFailed) throw new Error('Real transport barrier failed or expired');
    },
  };
}
