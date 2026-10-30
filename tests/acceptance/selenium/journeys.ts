import { By } from 'selenium-webdriver';
import type { SeedContract } from '../shared/schema.js';
import { draftIdFromURL } from './boundaries.js';
import { UI, account, button } from './ui.js';

export type Evidence = { assertions: string[]; evidence: string[] };
export type Journey = { id: string; actor: 'manager_primary' | 'composer'; partition: string;
  run: (ui: UI, seed: SeedContract, record: Evidence) => Promise<void> };
const mailbox = (seed: SeedContract): string => `http://app.test/#/mailboxes/${seed.mailboxes.primary}`;
const threadLink = (seed: SeedContract): By => By.css(`a[data-thread][href="#/mailboxes/${seed.mailboxes.primary}/threads/${seed.data.thread_primary}"]`);
export async function login(ui: UI, seed: SeedContract, actor: Journey['actor'], password: string): Promise<void> {
  await ui.driver.get('http://app.test/');
  await ui.ready(By.xpath('//h1[normalize-space(.)="Sign in"]'));
  await ui.fill('Email address', seed.actors[actor].email, true);
  await ui.fill('Password', password, true);
  await ui.click(button('Sign in'));
  await ui.ready(account);
}
// AIDEV-NOTE: Fresh W3C sessions isolate journeys; reload destroys React memory before persistence assertions.
export const journeys: Journey[] = [
  { id: 'SCN-AUTH-001-P', actor: 'manager_primary', partition: 'w3c-password-login-cookie-backed-reload',
    async run(ui, seed, record) {
      await ui.driver.get(mailbox(seed));
      await ui.ready(threadLink(seed));
      await ui.driver.navigate().refresh();
      await ui.ready(account);
      await ui.ready(threadLink(seed));
      record.assertions.push('Actual UI password login and protected mailbox survive full reload');
    } },
  { id: 'SCN-READ-002-P', actor: 'manager_primary', partition: 'w3c-seeded-plaintext-reload-back',
    async run(ui, seed, record) {
      await ui.driver.get(mailbox(seed));
      await ui.click(threadLink(seed));
      await ui.plaintext(seed.data.marker);
      await ui.driver.navigate().refresh();
      await ui.plaintext(seed.data.marker);
      await ui.click(By.partialLinkText('Back to conversations'));
      await ui.ready(threadLink(seed));
      record.assertions.push('Seeded thread plaintext survives reload and returns to the mailbox list');
    } },
  { id: 'SCN-DRAFT-001-P', actor: 'composer', partition: 'w3c-new-draft-exact-fields-list-reopen-reload',
    async run(ui, seed, record) {
      await ui.driver.get(`${mailbox(seed)}/drafts`);
      await ui.click(button('New draft'));
      await ui.ready(By.css('article[aria-label="Draft"]'));
      const subject = `${seed.data.marker} SELENIUM`;
      const body = `${seed.data.marker}\nLiteral <b>draft</b> & exact whitespace.\n`;
      const recipient = 'recipient@acceptance.test';
      await ui.fill('Subject', subject);
      await ui.fill('To', recipient);
      await ui.fill('Message', body);
      const id = draftIdFromURL(await ui.driver.getCurrentUrl(), seed.mailboxes.primary);
      await ui.click(button('Save draft'));
      const saved = By.xpath('//*[self::span][normalize-space(.)="Saved version 1"]');
      await ui.ready(saved);
      await ui.click(By.partialLinkText('Back to drafts'));
      const link = By.css(`a[href="#/mailboxes/${seed.mailboxes.primary}/drafts/${id}"]`);
      await ui.text(link, subject);
      await ui.click(link);
      await ui.value('Subject', subject);
      await ui.driver.navigate().refresh();
      await ui.value('Subject', subject);
      await ui.value('To', recipient);
      await ui.value('Message', body);
      await ui.ready(saved);
      if (draftIdFromURL(await ui.driver.getCurrentUrl(), seed.mailboxes.primary) !== id)
        throw new Error('Reopened draft identity mismatch');
      record.assertions.push('New draft identity and version 1 exact fields survive list reopen and full reload');
      record.evidence.push('W3C UI persistence round trip; no wire receipt or independent SQL claim');
    } },
  { id: 'SCN-AUTH-003-P', actor: 'manager_primary', partition: 'w3c-logout-protected-full-reload-denial',
    async run(ui, seed, record) {
      await ui.driver.get(mailbox(seed));
      await ui.ready(threadLink(seed));
      await ui.click(account);
      await ui.click(button('Sign out'));
      const signIn = By.xpath('//h1[normalize-space(.)="Sign in"]');
      await ui.ready(signIn);
      await ui.driver.get(mailbox(seed));
      await ui.driver.navigate().refresh();
      await ui.ready(signIn);
      await ui.absent(account);
      await ui.absent(By.css('a[data-thread]'));
      record.assertions.push('Logout followed by protected navigation and reload shows sign-in with no protected list');
    } },
];
