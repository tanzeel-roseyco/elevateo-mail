# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-system.spec.ts >> corporate empty
- Location: e2e/design-system.spec.ts:53:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Nothing archived', { exact: true }).first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('Nothing archived', { exact: true }).first() with timeout 5000ms
  - waiting for getByText('Nothing archived', { exact: true }).first()

```

```yaml
- link "Skip to content":
  - /url: "#main"
- complementary:
  - link "Elevateo home":
    - /url: "#/"
    - text: Elevateo Co.
  - button "Toggle sidebar" [expanded]
  - 'button "Workspace: Synthetic organization A"': Synthetic organization A
  - navigation "Primary":
    - list:
      - listitem:
        - link "Inbox":
          - /url: "#/inbox"
      - listitem:
        - link "Dashboard":
          - /url: "#/"
  - navigation "Mail":
    - paragraph: Mail
    - list:
      - listitem:
        - link "Fixture inbox":
          - /url: "#/mailboxes/00000000-0000-4000-8000-000000000021"
      - listitem:
        - link "C/D fixture mailbox":
          - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023"
      - listitem:
        - link "Search":
          - /url: "#/search"
  - navigation "Outreach":
    - paragraph: Outreach
    - list:
      - listitem:
        - link "Campaigns":
          - /url: "#/outreach/campaigns"
      - listitem:
        - link "Leads":
          - /url: "#/outreach/leads"
      - listitem:
        - link "Accounts":
          - /url: "#/outreach/accounts"
      - listitem:
        - link "Analytics":
          - /url: "#/outreach/analytics"
  - navigation "Contacts":
    - paragraph: Contacts
    - list:
      - listitem:
        - link "People":
          - /url: "#/people"
      - listitem:
        - link "Email finder":
          - /url: "#/email-finder"
  - navigation "Administration":
    - list:
      - listitem:
        - link "Settings":
          - /url: "#/settings"
      - listitem:
        - link "Help":
          - /url: "#/help"
  - button "Account and sign-out": Fixture user A
- main:
  - heading "Inbox" [level=1]
  - paragraph: C/D fixture mailbox · collaboration@example.test
  - search "Search mail":
    - text: Search mail
    - searchbox "Search mail"
    - text: Search scope
    - combobox "Search scope":
      - option "All mailboxes" [selected]
      - option "Fixture inbox"
      - option "C/D fixture mailbox"
    - button "Run search": Go
  - button "Get Help"
  - separator
  - combobox "Mailbox":
    - option "Fixture inbox"
    - option "C/D fixture mailbox" [selected]
  - button "Compose"
  - navigation "Folders":
    - list:
      - listitem:
        - link "Inbox 1 unread":
          - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023"
          - text: Inbox 1
      - listitem:
        - link "Unread":
          - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023?filter=unread"
      - listitem:
        - link "Starred":
          - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023?filter=starred"
      - listitem:
        - link "Snoozed":
          - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023?filter=snoozed"
      - listitem:
        - link "Archive":
          - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023?filter=archive"
      - listitem:
        - link "Spam":
          - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023?filter=spam"
      - listitem:
        - link "Trash":
          - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023?filter=trash"
      - listitem:
        - link "Drafts":
          - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023/drafts"
      - listitem:
        - link "Members":
          - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023/members"
      - listitem:
        - link "Bounces":
          - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023/bounces"
      - listitem:
        - link "Suppressions":
          - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023/suppressions"
    - paragraph: Not available yet
    - list "Folders not available yet":
      - listitem: Sent
  - region "Conversations":
    - heading "Conversations" [level=2]
    - checkbox "Select all conversations"
    - button "Refresh"
    - navigation "Filter":
      - link "All":
        - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023"
      - link "Unread":
        - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023?filter=unread"
      - link "Starred":
        - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023?filter=starred"
    - text: 1–1 of 1
    - button "Newer conversations" [disabled]
    - button "Older conversations" [disabled]
    - list "Conversation list":
      - listitem:
        - checkbox "Select Synthetic thread from Fixture sender"
        - button "Star Synthetic thread from Fixture sender"
        - link "Unread, Fixture sender Synthetic thread – <img src=\"https://example.invalid/pixel\"> & plaintext 13 Oct":
          - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023/threads/00000000-0000-4000-8000-000000000033"
    - paragraph: "Keyboard: j/k move · o open · x select · s star · e archive · # delete · ! spam · Shift+U unread · / search · c compose · u back to list"
- status: "Simulated local mail Simulation mode: no mail is sent or received. Drafts and notes are saved on the server."
- status
- note: Development fixtures — synthetic data only. Nothing is sent, received or saved.
```

# Test source

```ts
  1   | import { expect, test, type Page, type TestInfo } from '@playwright/test'
  2   | import { REVIEW, STATUS } from '../src/features/send/sendTestData'
  3   |
  4   | // AIDEV-NOTE: Synthetic routes capture the real UI without sending mail or contacting discovery services.
  5   | const mailbox = REVIEW.mailbox_id
  6   | const base = `/mailboxes/${mailbox}`
  7   | const envelope = { context_id: REVIEW.context_id, authorization_version: REVIEW.authorization_version }
  8   | const session = { ...envelope, actor: { id: '00000000-0000-4000-8000-000000000001', display_name: 'Design reviewer' }, organization: { id: '00000000-0000-4000-8000-000000000011', name: 'Elevateo workspace' }, simulation_mode: true, csrf_token: 'design_csrf_0123456789' }
  9   | const mailboxes = { ...envelope, next_cursor: null, items: [{ id: mailbox, display_name: 'Corporate mailbox', display_address: 'team@example.test', capabilities: { read: true, compose: true, approve_send: true, manage_members: false } }] }
  10  | async function routeApi(page: Page, routes: Record<string, unknown>) {
  11  |   await page.route('**/v1/**', route => {
  12  |     const path = new URL(route.request().url()).pathname
  13  |     const body = path === '/v1/session' ? session : path === '/v1/mailboxes' ? mailboxes : routes[path]
  14  |     return route.fulfill({ status: body === undefined ? 404 : 200, contentType: 'application/json', body: JSON.stringify(body ?? { code: 'not_available', message: 'Synthetic unavailable resource', request_id: 'visual' }) })
  15  |   })
  16  | }
  17  | async function capture(page: Page, info: TestInfo, name: string) {
  18  |   await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
  19  |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  20  |   await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true })
  21  |   const axeScript = process.env['ELEVATEO_AXE_SCRIPT']
  22  |   if (axeScript) {
  23  |     await page.addScriptTag({ path: axeScript })
  24  |     const results = await page.evaluate(async () => {
  25  |       const browser = window as unknown as { axe: { run(options: object): Promise<{ violations: unknown[] }> } }
  26  |       return browser.axe.run({ runOnly: ['color-contrast'] })
  27  |     })
  28  |     await info.attach(`${name}-contrast`, { body: JSON.stringify(results, null, 2), contentType: 'application/json' })
  29  |     expect(results.violations).toEqual([])
  30  |   }
  31  |   // Actual rendered token contrast, including the forced light result under an OS dark preference.
  32  |   const palette = await page.evaluate(() => {
  33  |     const css = getComputedStyle(document.documentElement)
  34  |     return ['fg', 'muted', 'line', 'surface'].map(name => css.getPropertyValue(`--color-${name}`).trim())
  35  |   })
  36  |   const luminance = (hex: string) => {
  37  |     const channel = (offset: number) => { const c = parseInt(hex.slice(offset, offset + 2), 16) / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4 }
  38  |     return .2126 * channel(1) + .7152 * channel(3) + .0722 * channel(5)
  39  |   }
  40  |   const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
  41  |   expect(contrast(palette[0]!, palette[3]!)).toBeGreaterThanOrEqual(4.5)
  42  |   expect(contrast(palette[1]!, palette[3]!)).toBeGreaterThanOrEqual(4.5)
  43  |   expect(contrast(palette[2]!, palette[3]!)).toBeGreaterThanOrEqual(3)
  44  | }
  45  | const screens = [
  46  |   ['inbox', base, 'Synthetic thread'],
  47  |   ['thread', `${base}/threads/00000000-0000-4000-8000-000000000033`, 'Synthetic thread'],
  48  |   ['draft-editor', `${base}/drafts/00000000-0000-4000-8000-000000000051`, 'Saved version 2'],
  49  |   ['settings', '/settings', 'Update Workspace Name'],
  50  |   ['empty', `${base}?view=archive`, 'Nothing archived'],
  51  | ] as const
  52  | for (const [name, path, ready] of screens) {
  53  |   test(`corporate ${name}`, async ({ page }, info) => {
  54  |     await page.emulateMedia({ colorScheme: 'dark' })
  55  |     await page.goto(`/dev-fixtures.html#${path}`)
> 56  |     await expect(page.getByText(ready, { exact: true }).first()).toBeVisible()
      |                                                                  ^ Error: expect(locator).toBeVisible() failed
  57  |     await capture(page, info, name)
  58  |     if (name === 'draft-editor') {
  59  |       await page.getByRole('link', { name: 'Review simulated send' }).scrollIntoViewIfNeeded()
  60  |       await capture(page, info, 'draft-editor-actions')
  61  |     }
  62  |   })
  63  | }
  64  | test('corporate outreach', async ({ page }, info) => {
  65  |   await routeApi(page, {})
  66  |   await page.route('**/v2/outreach/campaigns**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [{ id: '00000000-0000-4000-8000-000000000081', name: 'Customer updates', status: 'draft', version: 1 }], next_cursor: null }) }))
  67  |   await page.goto('/#/outreach/campaigns')
  68  |   await expect(page.getByRole('link', { name: 'Customer updates' })).toBeVisible()
  69  |   await capture(page, info, 'outreach')
  70  | })
  71  | test('corporate email finder', async ({ page }, info) => {
  72  |   await routeApi(page, {})
  73  |   await page.route('**/v2/email-finder/**', route => {
  74  |     const body = route.request().url().endsWith('/health')
  75  |       ? { smtp_available: false, smtp_reason: 'SMTP checks unavailable in this preview', ehlo_hostname: 'mail.example.test', remaining_daily_probes: 48, halted_until: null, worker_seen_at: '2026-10-29T00:00:00Z' }
  76  |       : { items: [] }
  77  |     return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  78  |   })
  79  |   await page.goto('/#/email-finder')
  80  |   await expect(page.getByLabel('Full name')).toBeVisible()
  81  |   await capture(page, info, 'email-finder')
  82  | })
  83  | test('corporate sign-in', async ({ page }, info) => {
  84  |   await page.goto('/dev-fixtures.html#/fixtures?getSession=unauthenticated')
  85  |   await expect(page.getByLabel('Email address')).toBeVisible()
  86  |   await page.getByLabel('Email address').focus()
  87  |   await capture(page, info, 'sign-in')
  88  | })
  89  | test('corporate send review', async ({ page }, info) => {
  90  |   await routeApi(page, { [`/v1/drafts/${REVIEW.draft_id}/send-review`]: REVIEW })
  91  |   await page.goto(`/#${base}/drafts/${REVIEW.draft_id}/send-review`)
  92  |   await expect(page.getByRole('heading', { name: 'Review saved draft version 1' })).toBeVisible()
  93  |   await capture(page, info, 'send-review')
  94  |   await page.getByRole('button', { name: 'Approve simulated send' }).scrollIntoViewIfNeeded()
  95  |   await capture(page, info, 'send-review-actions')
  96  | })
  97  | test('corporate send status', async ({ page }, info) => {
  98  |   await routeApi(page, { [`/v1/send-intents/${STATUS.send_id}`]: STATUS })
  99  |   await page.goto(`/#${base}/send-intents/${STATUS.send_id}`)
  100 |   await expect(page.getByRole('button', { name: 'Cancel before dispatch' })).toBeVisible()
  101 |   await capture(page, info, 'send-status')
  102 | })
  103 | test('corporate loading', async ({ page }, info) => {
  104 |   await page.route('**/v1/session', () => {})
  105 |   await page.goto('/')
  106 |   await expect(page.getByRole('status', { name: 'Loading session' })).toBeVisible()
  107 |   await capture(page, info, 'loading')
  108 | })
  109 | test('corporate error', async ({ page }, info) => {
  110 |   await page.route('**/v1/session', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'unavailable', message: 'Synthetic unavailable service', request_id: 'visual' }) }))
  111 |   await page.goto('/')
  112 |   await expect(page.getByRole('alert')).toBeVisible()
  113 |   await capture(page, info, 'error')
  114 | })
  115 |
```