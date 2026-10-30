import type { Page } from 'puppeteer-core';
import { atCredentialOrigin } from '../playwright/credential-origin.js';

export const account = 'button[aria-label="Account and sign-out"]';
export const button = (text: string): string => `::-p-aria([name="${text}"][role="button"])`;
const field = (text: string): string => `::-p-aria([name="${text}"])`;
// AIDEV-NOTE: Poll only read readiness; each click and keyboard edit is issued once, never action-retried.
export class UI {
  constructor(readonly page: Page, readonly timeout: number) {
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);
  }
  async ready(selector: string): Promise<void> {
    const handle = await this.page.waitForSelector(selector, { visible: true, timeout: this.timeout });
    if (!handle) throw new Error('Missing UI control');
    await handle.dispose();
  }
  async click(selector: string): Promise<void> {
    await this.ready(selector);
    const element = await this.page.$(selector);
    if (!element) throw new Error('Missing UI control');
    try {
      const ready = await this.page.waitForFunction(node => !node.matches(':disabled'),
        { timeout: this.timeout }, element);
      await ready.dispose();
      await element.click();
    } finally { await element.dispose(); }
  }
  async fill(label: string, value: string, credential = false): Promise<void> {
    await this.click(field(label));
    await this.page.keyboard.down('Control');
    try { await this.page.keyboard.press('KeyA'); }
    finally { await this.page.keyboard.up('Control'); }
    await this.page.keyboard.press('Backspace');
    const enter = async (): Promise<void> => { await this.page.keyboard.type(value); };
    if (credential) await atCredentialOrigin(() => this.page.url(), enter);
    else await enter();
  }
  async value(label: string, expected: string): Promise<void> {
    await this.ready(field(label));
    const actual = await this.page.$eval(field(label), element =>
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.value : null);
    if (actual !== expected) throw new Error('Field value mismatch');
  }
  async plaintext(marker: string): Promise<void> {
    const handle = await this.page.waitForFunction(value => Array.from(
      document.querySelectorAll('article[aria-label="Conversation"] pre'))
      .some(element => {
        // AIDEV-NOTE: The matching child-free node itself and its ancestors must render, not a different pre.
        if (!element.textContent?.includes(value) || element.children.length !== 0
          || element.getClientRects().length === 0) return false;
        for (let node: Element | null = element; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0
            || style.contentVisibility === 'hidden' || node.hasAttribute('hidden')) return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }),
    { timeout: this.timeout }, marker);
    await handle.dispose();
  }
  async absent(selector: string): Promise<void> {
    if (await this.page.$eval('body', (body, query) => body.querySelector(query) !== null, selector))
      throw new Error('Protected UI remains present');
  }
}
