# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-system.spec.ts >> corporate draft-editor
- Location: e2e/design-system.spec.ts:53:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.scrollIntoViewIfNeeded: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('link', { name: 'Review simulated send' })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - link "Skip to content" [ref=e5] [cursor=pointer]:
      - /url: "#main"
    - complementary [ref=e6]:
      - generic [ref=e7]:
        - generic [ref=e8]:
          - link "Elevateo home" [ref=e9] [cursor=pointer]:
            - /url: "#/"
            - generic [ref=e11]: Elevateo Co.
          - button "Toggle sidebar" [expanded] [ref=e12]
        - 'button "Workspace: Synthetic organization A" [ref=e16]':
          - generic [ref=e17]: Synthetic organization A
        - generic [ref=e20]:
          - navigation "Primary" [ref=e21]:
            - list [ref=e22]:
              - listitem [ref=e23]:
                - link "Inbox" [ref=e24] [cursor=pointer]:
                  - /url: "#/inbox"
              - listitem [ref=e28]:
                - link "Dashboard" [ref=e29] [cursor=pointer]:
                  - /url: "#/"
          - navigation [ref=e33]:
            - paragraph [ref=e34]: Mail
            - list [ref=e35]:
              - listitem [ref=e36]:
                - link "Fixture inbox" [ref=e37] [cursor=pointer]:
                  - /url: "#/mailboxes/00000000-0000-4000-8000-000000000021"
              - listitem [ref=e41]:
                - link "C/D fixture mailbox" [ref=e42] [cursor=pointer]:
                  - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023"
              - listitem [ref=e46]:
                - link "Search" [ref=e47] [cursor=pointer]:
                  - /url: "#/search"
          - navigation [ref=e51]:
            - paragraph [ref=e52]: Outreach
            - list [ref=e53]:
              - listitem [ref=e54]:
                - link "Campaigns" [ref=e55] [cursor=pointer]:
                  - /url: "#/outreach/campaigns"
              - listitem [ref=e59]:
                - link "Leads" [ref=e60] [cursor=pointer]:
                  - /url: "#/outreach/leads"
              - listitem [ref=e64]:
                - link "Accounts" [ref=e65] [cursor=pointer]:
                  - /url: "#/outreach/accounts"
              - listitem [ref=e69]:
                - link "Analytics" [ref=e70] [cursor=pointer]:
                  - /url: "#/outreach/analytics"
          - navigation [ref=e74]:
            - paragraph [ref=e75]: Contacts
            - list [ref=e76]:
              - listitem [ref=e77]:
                - link "People" [ref=e78] [cursor=pointer]:
                  - /url: "#/people"
              - listitem [ref=e82]:
                - link "Email finder" [ref=e83] [cursor=pointer]:
                  - /url: "#/email-finder"
          - navigation "Administration" [ref=e88]:
            - list [ref=e89]:
              - listitem [ref=e90]:
                - link "Settings" [ref=e91] [cursor=pointer]:
                  - /url: "#/settings"
              - listitem [ref=e96]:
                - link "Help" [ref=e97] [cursor=pointer]:
                  - /url: "#/help"
        - button "Account and sign-out" [ref=e102]:
          - generic [aria-hidden] [ref=e103]: FA
          - generic [ref=e104]: Fixture user A
    - generic [ref=e108]:
      - main [ref=e109]:
        - generic [ref=e110]:
          - generic [ref=e112]:
            - generic [ref=e113]:
              - generic [ref=e114]:
                - heading "Inbox" [level=1] [ref=e115]
                - paragraph [ref=e116]: C/D fixture mailbox · collaboration@example.test
              - generic [ref=e117]:
                - search "Search mail" [ref=e118]:
                  - generic [ref=e119]:
                    - generic [ref=e120]: Search mail
                    - searchbox "Search mail" [ref=e122]
                  - generic [ref=e123]:
                    - generic [ref=e124]: Search scope
                    - combobox "Search scope" [ref=e126]:
                      - option "All mailboxes" [selected]
                      - option "Fixture inbox"
                      - option "C/D fixture mailbox"
                  - button "Run search" [ref=e127]: Go
                - button "Get Help" [ref=e129]
            - separator [ref=e134]
          - generic [ref=e135]:
            - generic [ref=e137]:
              - combobox "Mailbox" [ref=e139]:
                - option "Fixture inbox"
                - option "C/D fixture mailbox" [selected]
              - button "Compose" [ref=e140]
              - navigation "Folders" [ref=e143]:
                - list [ref=e144]:
                  - listitem [ref=e145]:
                    - link "Inbox" [ref=e146] [cursor=pointer]:
                      - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023"
                  - listitem [ref=e150]:
                    - link "Unread" [ref=e151] [cursor=pointer]:
                      - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023?filter=unread"
                  - listitem [ref=e155]:
                    - link "Starred" [ref=e156] [cursor=pointer]:
                      - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023?filter=starred"
                  - listitem [ref=e160]:
                    - link "Snoozed" [ref=e161] [cursor=pointer]:
                      - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023?filter=snoozed"
                  - listitem [ref=e165]:
                    - link "Archive" [ref=e166] [cursor=pointer]:
                      - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023?filter=archive"
                  - listitem [ref=e170]:
                    - link "Spam" [ref=e171] [cursor=pointer]:
                      - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023?filter=spam"
                  - listitem [ref=e175]:
                    - link "Trash" [ref=e176] [cursor=pointer]:
                      - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023?filter=trash"
                  - listitem [ref=e180]:
                    - link "Drafts" [ref=e181] [cursor=pointer]:
                      - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023/drafts"
                  - listitem [ref=e185]:
                    - link "Members" [ref=e186] [cursor=pointer]:
                      - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023/members"
                  - listitem [ref=e190]:
                    - link "Bounces" [ref=e191] [cursor=pointer]:
                      - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023/bounces"
                  - listitem [ref=e195]:
                    - link "Suppressions" [ref=e196] [cursor=pointer]:
                      - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023/suppressions"
                - paragraph [ref=e200]: Not available yet
                - list "Folders not available yet" [ref=e201]:
                  - listitem [ref=e202]:
                    - generic "Not available yet" [ref=e203]: Sent
            - generic [ref=e207]:
              - region "Drafts" [ref=e208]:
                - generic [ref=e209]:
                  - heading "Drafts" [level=1] [ref=e210]
                  - generic [ref=e211]: Stored on this installation only
                  - button "New draft" [ref=e212]
                - generic [ref=e215]:
                  - generic [ref=e216]:
                    - button "Refresh drafts" [ref=e217]
                    - generic [ref=e220]: 1–1 of 1
                  - list [ref=e221]:
                    - listitem [ref=e222]:
                      - link "Draft Fixture draft Reply v2 13 Oct" [ref=e223] [cursor=pointer]:
                        - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023/drafts/00000000-0000-4000-8000-000000000051"
                        - generic [ref=e226]: Draft
                        - generic [ref=e227]: Fixture draft
                        - generic [ref=e228]: Reply
                        - generic [ref=e229]: v2
                        - generic [ref=e230]: 13 Oct
              - region "Compose" [ref=e231]:
                - generic [ref=e232]:
                  - generic [ref=e233]: New message
                  - button "Minimise" [expanded] [ref=e234]
                  - button "Maximise" [ref=e236]
                  - button "Close compose" [ref=e239]
                - article "Draft" [ref=e243]:
                  - generic [ref=e244]:
                    - link "Back to drafts" [ref=e245] [cursor=pointer]:
                      - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023/drafts"
                    - generic [aria-hidden] [ref=e248]: ·
                    - generic [ref=e249]: Saved version 2
                    - generic [ref=e250]: · updated 13 Oct 2026, 00:01
                    - link "Replying to a conversation" [ref=e251] [cursor=pointer]:
                      - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023/threads/00000000-0000-4000-8000-000000000033"
                    - generic [ref=e252]: Draft only — nothing is sent
                  - heading "Fixture draft" [active] [level=1] [ref=e253]
                  - generic [ref=e254]:
                    - generic [ref=e255]:
                      - generic [ref=e256]:
                        - generic [ref=e257]: To
                        - textbox "To" [ref=e259]: Fixture recipient <recipient@example.test>
                      - paragraph [ref=e260]: "One recipient per line: Name <address> or just an address. Incomplete recipients are kept as typed."
                    - generic [ref=e262]:
                      - generic [ref=e263]: Subject
                      - textbox "Subject" [ref=e265]: Fixture draft
                    - generic [ref=e266]:
                      - generic [ref=e267]:
                        - generic [ref=e268]: Message
                        - textbox "Message" [ref=e270]:
                          - /placeholder: Write your message
                          - text: "Draft plaintext <script>alert(1)</script> No remote image: https://example.invalid/pixel Unicode: 📨"
                      - paragraph [ref=e271]: 99 / 65536 characters
                    - generic [ref=e273]:
                      - button "Save changes" [ref=e274]
                      - generic [ref=e275]:
                        - button "Attach file (save the draft first)" [disabled]
                        - button "Discard (not available yet)" [disabled]
      - status [ref=e276]:
        - generic [ref=e277]: Simulated local mail
        - generic [ref=e278]: "Simulation mode: no mail is sent or received. Drafts and notes are saved on the server."
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
  56  |     await expect(page.getByText(ready, { exact: true }).first()).toBeVisible()
  57  |     await capture(page, info, name)
  58  |     if (name === 'draft-editor') {
> 59  |       await page.getByRole('link', { name: 'Review simulated send' }).scrollIntoViewIfNeeded()
      |                                                                       ^ Error: locator.scrollIntoViewIfNeeded: Test timeout of 30000ms exceeded.
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