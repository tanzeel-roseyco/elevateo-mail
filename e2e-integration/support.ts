import { expect, type Page, type TestInfo } from '@playwright/test'

// AIDEV-NOTE: Helpers for tests that run the API-backed build against the real server. Requests are NOT mocked:
// the browser talks to the server through the preview proxy. `control` drives the Docker-only test harness.
// No test ever holds a session token: the server's fixture sets an HttpOnly cookie when a synthetic user is chosen.

export type FixtureUser = 'alice' | 'bob'
type Control =
  | { do: 'reset' }
  | { do: 'outage'; on: boolean }
  | { do: 'tick' }
  | { do: 'pause'; on: boolean }
  | { do: 'expire-session'; who: FixtureUser }
  | { do: 'dispatch'; owner: string; id: string; scenario: 'reject' | 'ambiguous' }
  | { do: 'crash-claim'; owner: string; id: string }
  | { do: 'intents'; owner: string }
  | { do: 'replacements'; owner: string }

export interface IntentRow {
  id: string
  status: string
  idempotency_key: string
  recipient_count: number
}
export interface ReplacementRow {
  predecessor_id: string
  successor_id: string
}

const CONTROL_URL = process.env.IT_CONTROL_URL
export async function control<T = unknown>(action: Control): Promise<T> {
  if (!CONTROL_URL) throw new Error('IT_CONTROL_URL is not set: these tests need the integration server (integration/compose.yaml).')
  const response = await fetch(CONTROL_URL, { method: 'POST', body: JSON.stringify(action) })
  if (!response.ok) throw new Error(`Harness refused ${action.do}: ${await response.text()}`)
  return (await response.json()) as T
}

/** Fresh fixture data and fresh synthetic sessions for every test. */
export const reset = (): Promise<unknown> => control({ do: 'reset' })
export const intents = (owner: string): Promise<IntentRow[]> => control<IntentRow[]>({ do: 'intents', owner })
export const replacements = (owner: string): Promise<ReplacementRow[]> => control<ReplacementRow[]>({ do: 'replacements', owner })

export const fixtureButton = (page: Page, user: FixtureUser) => page.getByRole('button', { name: `Continue as synthetic user ${user}` })

/** Signs in through the real sign-in screen: the server's fixture sets the session cookie for a synthetic user. */
export async function signIn(page: Page, user: FixtureUser = 'alice'): Promise<void> {
  await page.goto('/')
  await fixtureButton(page, user).click()
  await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible()
}

export async function fillMessage(page: Page, message: { to: string; subject: string; body: string }): Promise<void> {
  await page.goto('/compose')
  await page.getByLabel('To', { exact: true }).fill(message.to)
  await page.getByLabel('Subject').fill(message.subject)
  await page.getByLabel('Message', { exact: true }).fill(message.body)
  await page.getByRole('button', { name: 'Review' }).click()
  await expect(page.getByRole('heading', { name: 'Review before submitting' })).toBeVisible()
}

/** Writes a message and submits it for approval, ending on the request's own page. Returns the server's id. */
export async function composeAndSubmit(page: Page, message: { to: string; subject: string; body: string }): Promise<string> {
  await fillMessage(page, message)
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page).toHaveURL(/\/sends\/[\w-]+$/)
  await expect(page.getByRole('heading', { name: message.subject, level: 2 })).toBeVisible()
  return new URL(page.url()).pathname.split('/').pop()!
}

/** Creates saved requests straight through the server's API, as the signed-in user, without going through the form. */
export async function createDrafts(page: Page, count: number, mailboxId: string): Promise<void> {
  const statuses = await page.evaluate(
    async ([n, mailbox]) => {
      const results: number[] = []
      for (let i = 0; i < n!; i++) {
        const body = JSON.stringify({ mailboxId: mailbox, to: [`bulk${i}@partner.example`], subject: `Bulk request ${i}`, body: `Bulk body ${i}`, kind: 'manual', revision: 1, idempotencyKey: `bulk-${i}-${crypto.randomUUID()}` })
        results.push((await fetch('/v1/send-intents', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-elevateo-csrf': '1' }, body })).status)
      }
      return results
    },
    [count, mailboxId] as const,
  )
  expect(statuses.every((s) => s === 200 || s === 201)).toBe(true)
}

/** Everything this origin keeps in script-readable browser storage, as one string to search. */
export const browserStorage = (page: Page): Promise<string> => page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }))

export const status = (page: Page) => page.getByRole('region', { name: 'Status' })
export const requestRows = (page: Page) => page.getByRole('list', { name: 'Saved send requests' }).getByRole('listitem')
export const shot = (page: Page, info: TestInfo, name: string) => page.screenshot({ path: `e2e-shots/it-${info.project.name}-${name}.png` })
