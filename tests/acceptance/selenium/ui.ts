import { By, error } from 'selenium-webdriver';
import type { WebDriver, WebElement } from 'selenium-webdriver';
import { atCredentialOrigin } from '../playwright/credential-origin.js';

export const button = (name: string): By => By.xpath(`//button[normalize-space(.)='${name}']`);
export const field = (label: string): By => By.xpath(`//*[@id=//label[normalize-space(.)='${label}']/@for]`);
export const account = By.css('button[aria-label="Account and sign-out"]');
// AIDEV-NOTE: Re-query only reads on stale DOM; never retry a click or save that may already have taken effect.
export class UI {
  constructor(readonly driver: WebDriver, readonly timeout: number) {}
  async ready(by: By, check: (element: WebElement) => Promise<boolean> = async () => true): Promise<WebElement> {
    let stale = 0;
    const result = await this.driver.wait(async () => {
      try {
        const elements = await this.driver.findElements(by);
        const element = elements[0];
        return element && await element.isDisplayed() && await check(element) ? element : false;
      } catch (cause: unknown) {
        if (cause instanceof error.StaleElementReferenceError && ++stale <= 2) return false;
        throw new Error('UI readiness failed');
      }
    }, this.timeout, 'UI readiness deadline exceeded');
    if (!result) throw new Error('UI readiness failed');
    return result;
  }
  async click(by: By): Promise<void> { await (await this.ready(by, element => element.isEnabled())).click(); }
  async fill(label: string, value: string, credential = false): Promise<void> {
    const element = await this.ready(field(label), item => item.isEnabled());
    await element.clear();
    const enter = async (): Promise<void> => { await element.sendKeys(value); };
    if (credential) await atCredentialOrigin(() => this.driver.getCurrentUrl(), enter);
    else await enter();
  }
  async value(label: string, expected: string): Promise<void> {
    await this.ready(field(label), async element => (await element.getAttribute('value')) === expected);
  }
  async text(by: By, expected: string): Promise<void> {
    await this.ready(by, async element => (await element.getText()).includes(expected));
  }
  async plaintext(marker: string): Promise<void> {
    await this.driver.wait(async () => this.driver.executeScript<boolean>((value: string) =>
      Array.from(document.querySelectorAll('article[aria-label="Conversation"] pre')).some(element => {
        // AIDEV-NOTE: Match literal text and visibility on the same child-free pre, as in the Puppeteer lane.
        if (!element.textContent?.includes(value) || element.children.length !== 0
          || element.getClientRects().length === 0) return false;
        for (let node: Element | null = element; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0
            || style.contentVisibility === 'hidden' || node.hasAttribute('hidden')) return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }), marker), this.timeout, 'Plaintext readiness deadline exceeded');
  }
  async absent(by: By): Promise<void> {
    await this.driver.wait(async () => (await this.driver.findElements(by)).length === 0,
      this.timeout, 'Protected UI remained available');
  }
}
