import { expect } from '@playwright/test';
import { scenario } from './cases.js';
import { mailbox, responseAt, screenshot, seed, signIn } from './support.js';

// AIDEV-NOTE: Each visual partition waits for the seeded API list and visible thread before capture.
scenario('SCN-QA-822-P', 'branded-populated-shell-three-widths-light-dark', async (page, record) => {
  await signIn(page, 'manager_primary');
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      const [list] = await Promise.all([responseAt(page, `/v1/mailboxes/${seed.mailboxes.primary}/threads`), mailbox(page)]);
      expect(list.status()).toBe(200);
      await expect(page.locator(`a[data-thread][href$="/threads/${seed.data.thread_primary}"]`)).toBeVisible();
      if (viewport.width < 768) {
        await page.getByRole('button', { name: 'Open navigation' }).click();
        const drawer = page.getByRole('dialog', { name: 'Navigation' });
        await expect(drawer.getByRole('navigation', { name: 'Personal' })).toBeVisible();
        await expect(drawer.getByRole('navigation', { name: 'Outreach' })).toBeVisible();
        await expect(drawer.getByRole('link', { name: 'People' })).toBeVisible();
      } else {
        await expect(page.getByRole('navigation', { name: 'Personal' })).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Outreach' })).toBeVisible();
        await expect(page.getByText('Elevateo Mail', { exact: true })).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      record.artifacts.push(await screenshot(page, `QA816-VISUAL-P-${viewport.width}-${colorScheme}`));
      if (viewport.width < 768) {
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'Navigation' })).toHaveCount(0);
      }
      record.evidence.push(`Settled real mailbox GET 200 at ${viewport.width}x${viewport.height} ${colorScheme}; no pixel acceptance inferred`);
    }
  }
  record.assertions.push('Six real API-backed populated shell captures at 390/768/1440 widths and light/dark with correct navigation and no horizontal overflow');
});
