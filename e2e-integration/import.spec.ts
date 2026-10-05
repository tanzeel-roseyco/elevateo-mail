import { expect, test } from '@playwright/test'
import { fixtureButton, reset, shot, signIn } from './support'

// AIDEV-NOTE: Real HTTP/D1 proves import confirmation, immutable retries and isolation; no requests are mocked.
test.beforeEach(async () => { await reset() })

for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme}: historical JSON import requires confirmation, survives reload and stays private`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: scheme })
    await signIn(page)
    await page.goto('/connections/mailboxes')
    const mailbox = page.getByRole('list', { name: 'Mailboxes' }).getByRole('listitem').filter({ hasText: 'alice@pilot.example' }).first()
    const panel = mailbox.getByRole('region', { name: 'Import historical messages' })
    const requests: string[] = []
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/import')) requests.push(request.url())
    })
    const subject = 'Historical import private subject'
    const body = 'Historical plaintext <b>must remain literal</b>.'
    const file = { name: 'history.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ messages: [{
      id: 'history-one', threadId: 'history-thread', sender: 'archive@example.com', subject, body,
      at: Date.UTC(2090, 0, 1),
    }] })) }
    await panel.getByLabel('Historical JSON file').setInputFiles(file)
    await expect(panel.getByText('Ready to import 1 messages into this mailbox.')).toBeVisible()
    expect(requests).toEqual([])
    await panel.scrollIntoViewIfNeeded()
    await shot(page, info, `${scheme}-historical-import-preview`)
    await panel.getByRole('button', { name: 'Confirm import' }).click()
    await expect(panel.getByRole('status')).toHaveText('1 messages imported; 0 already present.')
    expect(requests).toHaveLength(1)

    await page.goto('/mail/alice-main')
    await page.getByRole('link', { name: new RegExp(subject, 'u') }).click()
    await expect(page.getByRole('heading', { name: subject, level: 2 })).toBeVisible()
    await expect(page.getByText(body, { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText(body, { exact: true })).toBeVisible()

    await page.goto('/connections/mailboxes')
    await panel.getByLabel('Historical JSON file').setInputFiles(file)
    await expect(panel.getByText(/Ready to import/u)).toBeVisible()
    await panel.getByRole('button', { name: 'Confirm import' }).click()
    await expect(panel.getByRole('status')).toHaveText('0 messages imported; 1 already present.')
    expect(requests).toHaveLength(2)
    await page.getByRole('button', { name: 'Sign out' }).click()
    await fixtureButton(page, 'bob').click()
    await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible()
    await expect(page.getByText(subject, { exact: true })).toHaveCount(0)
    await expect(page.getByText(body, { exact: true })).toHaveCount(0)
    const foreign = await page.evaluate(async () => (await (await fetch('/v1/messages?mailboxId=alice-main')).json()) as { items: unknown[] })
    expect(foreign.items).toEqual([])
  })
}
