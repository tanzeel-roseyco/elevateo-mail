import { expect } from '@playwright/test';
import { scenario } from './cases.js';
import { draftReceipt } from './boundaries.js';
import { responseAt, seed, signIn } from './support.js';

// AIDEV-NOTE: Each case creates its own author-owned draft; no ordering dependency or shared seeded draft mutation.
for (const id of ['SCN-DRAFT-001-P', 'SCN-DRAFT-008-P']) {
  scenario(id, 'composer-new-editable-draft-save-list-reopen', async (page, record) => {
    await signIn(page, 'composer');
    await page.goto(`/#/mailboxes/${seed.mailboxes.primary}/drafts`);
    await page.getByRole('button', { name: 'New draft', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'New draft', exact: true })).toBeVisible();
    const subject = `${seed.data.marker} ${id}`;
    const body = `${seed.data.marker}\nLiteral <b>draft</b> & exact whitespace.\n`;
    await page.getByLabel('Subject', { exact: true }).fill(subject);
    await page.getByLabel('To', { exact: true }).fill('recipient@acceptance.test');
    await page.getByLabel('Message', { exact: true }).fill(body);
    const hash = new URL(page.url()).hash;
    const match = /\/drafts\/([0-9a-f-]{36})(?:\?|$)/.exec(hash);
    if (!match?.[1]) throw new Error('Draft route missing');
    const draftId = match[1];
    const [response] = await Promise.all([responseAt(page, `/v1/drafts/${draftId}`, 'PUT'),
      page.getByRole('button', { name: 'Save draft', exact: true }).click()]);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']?.includes('application/json')).toBe(true);
    const receipt = draftReceipt(await response.json() as unknown);
    expect(receipt.draft_id === draftId).toBe(true);
    expect(receipt.version).toBe(1);
    await expect(page.getByText('Saved version 1', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Back to drafts', exact: true }).click();
    const link = page.locator(`a[href="#/mailboxes/${seed.mailboxes.primary}/drafts/${draftId}"]`);
    await expect(link).toContainText(subject);
    const [detail] = await Promise.all([responseAt(page, `/v1/drafts/${draftId}`), link.click()]);
    expect(detail.status()).toBe(200);
    expect(detail.headers()['content-type']?.includes('application/json')).toBe(true);
    // Actual response receipt plus UI exact values establish the gateway/storage round trip without exporting bodies.
    await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(subject);
    await expect(page.getByLabel('To', { exact: true })).toHaveValue('recipient@acceptance.test');
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(body);
    await expect(page.getByText('Saved version 1', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(body);
    record.assertions.push('New draft receipt ID/version matches route; list summary and reopened exact fields survive reload');
    record.evidence.push('Observed real PUT draft 200 JSON editable version 1, then GET detail 200 JSON; bodies not retained');
  });
}
