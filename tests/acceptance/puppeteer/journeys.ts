import type { SeedContract } from '../shared/schema.js';
import { draftIdFromURL } from './boundaries.js';
import { UI, account, button } from './ui.js';

export type Journey = { id: string; actor: 'manager_primary' | 'composer'; partition: string;
  assertion: string; run: (ui: UI, seed: SeedContract) => Promise<void> };
const mailbox = (seed: SeedContract): string => `http://app.test/#/mailboxes/${seed.mailboxes.primary}`;
const thread = (seed: SeedContract): string =>
  `a[data-thread][href="#/mailboxes/${seed.mailboxes.primary}/threads/${seed.data.thread_primary}"]`;
export async function login(ui: UI, seed: SeedContract, actor: Journey['actor'], password: string): Promise<void> {
  await ui.page.goto('http://app.test/', { waitUntil: 'domcontentloaded' });
  await ui.ready('#sign-in-heading');
  await ui.fill('Email address', seed.actors[actor].email, true);
  await ui.fill('Password', password, true);
  await ui.click(button('Sign in'));
  await ui.ready(account);
}
// AIDEV-NOTE: Full document reload discards React memory; only GUI persistence is claimed, not a SQL oracle.
export const journeys: Journey[] = [
  { id: 'SCN-AUTH-001-P', actor: 'manager_primary', partition: 'cdp-password-login-protected-reload',
    assertion: 'Actual GUI login and seeded authorized mailbox survive document reload',
    async run(ui, seed) {
      await ui.page.goto(mailbox(seed));
      await ui.ready(thread(seed));
      await ui.page.reload();
      await ui.ready(account);
      await ui.ready(thread(seed));
    } },
  { id: 'SCN-READ-002-P', actor: 'manager_primary', partition: 'cdp-seeded-plaintext-reload-back',
    assertion: 'Seed marker is child-free plaintext before and after reload; back link restores seeded thread',
    async run(ui, seed) {
      await ui.page.goto(mailbox(seed));
      await ui.click(thread(seed));
      await ui.plaintext(seed.data.marker);
      await ui.page.reload();
      await ui.plaintext(seed.data.marker);
      await ui.click(`article[aria-label="Conversation"] a[href="#/mailboxes/${seed.mailboxes.primary}"]`);
      await ui.ready(thread(seed));
    } },
  { id: 'SCN-DRAFT-001-P', actor: 'composer', partition: 'cdp-create-save-list-reopen-exact-fields-reload',
    assertion: 'New draft UUID and saved version 1 exact subject, recipient and body survive list reopen and reload',
    async run(ui, seed) {
      await ui.page.goto(`${mailbox(seed)}/drafts`);
      await ui.click(button('New draft'));
      await ui.ready('article[aria-label="Draft"]');
      const subject = `${seed.data.marker} PUPPETEER`;
      const body = `${seed.data.marker}\nLiteral <b>draft</b> & exact whitespace.\n`;
      const recipient = 'recipient@acceptance.test';
      await ui.fill('Subject', subject);
      await ui.fill('To', recipient);
      await ui.fill('Message', body);
      const id = draftIdFromURL(ui.page.url(), seed.mailboxes.primary);
      await ui.click(button('Save draft'));
      const saved = '::-p-xpath(//span[normalize-space(.)="Saved version 1"])';
      await ui.ready(saved);
      await ui.click(`article[aria-label="Draft"] a[href="#/mailboxes/${seed.mailboxes.primary}/drafts"]`);
      await ui.click(`a[href="#/mailboxes/${seed.mailboxes.primary}/drafts/${id}"]`);
      await ui.value('Subject', subject);
      await ui.page.reload();
      await ui.value('Subject', subject);
      await ui.value('To', recipient);
      await ui.value('Message', body);
      await ui.ready(saved);
      if (draftIdFromURL(ui.page.url(), seed.mailboxes.primary) !== id) throw new Error('Draft identity mismatch');
    } },
  { id: 'SCN-AUTH-003-P', actor: 'manager_primary', partition: 'cdp-logout-protected-navigation-reload-denial',
    assertion: 'GUI logout then protected navigation and reload show sign-in without account or thread controls',
    async run(ui, seed) {
      await ui.page.goto(mailbox(seed));
      await ui.ready(thread(seed));
      await ui.click(account);
      await ui.click(button('Sign out'));
      await ui.ready('#sign-in-heading');
      await ui.page.goto(mailbox(seed));
      await ui.page.reload();
      await ui.ready('#sign-in-heading');
      await ui.absent(account);
      await ui.absent('a[data-thread]');
    } },
];
