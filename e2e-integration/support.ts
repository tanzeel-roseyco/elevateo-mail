import { expect, type Page, type TestInfo } from '@playwright/test'

// AIDEV-NOTE: Helpers for tests that run the API-backed build against the real server. Requests are NOT mocked:
// the browser talks to the server through the preview proxy. `control` drives the Docker-only test harness.

export interface Sessions {
  alice: string
  bob: string
  aliceExpiring: string
}
type Control =
  | { do: 'reset' }
  | { do: 'outage'; on: boolean }
  | { do: 'tick' }
  | { do: 'pause'; on: boolean }
  | { do: 'expire-session'; who: 'aliceExpiring' }
  | { do: 'dispatch'; owner: string; id: string; scenario: 'reject' | 'ambiguous' }
  | { do: 'crash-claim'; owner: string; id: string }
  | { do: 'intents'; owner: string }

export interface IntentRow {
  id: string
  status: string
  idempotency_key: string
  recipient_count: number
}

const CONTROL_URL = process.env.IT_CONTROL_URL
export async function control<T = unknown>(action: Control): Promise<T> {
  if (!CONTROL_URL) throw new Error('IT_CONTROL_URL is not set: these tests need the integration server (integration/compose.yaml).')
  const response = await fetch(CONTROL_URL, { method: 'POST', body: JSON.stringify(action) })
  if (!response.ok) throw new Error(`Harness refused ${action.do}: ${await response.text()}`)
  return (await response.json()) as T
}

/** Fresh fixture data and fresh synthetic sessions for every test. */
export const reset = async (): Promise<Sessions> => (await control<{ sessions: Sessions }>({ do: 'reset' })).sessions
export const intents = (owner: string): Promise<IntentRow[]> => control<IntentRow[]>({ do: 'intents', owner })

/** Signs in through the real sign-in screen with a synthetic session issued by the harness. */
export async function signIn(page: Page, token: string): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Pilot session').fill(token)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible()
}

/** Writes a message and submits it for approval, ending on the request's own page. */
export async function composeAndSubmit(page: Page, message: { to: string; subject: string; body: string }): Promise<void> {
  await page.goto('/compose')
  await page.getByLabel('To', { exact: true }).fill(message.to)
  await page.getByLabel('Subject').fill(message.subject)
  await page.getByLabel('Message', { exact: true }).fill(message.body)
  await page.getByRole('button', { name: 'Review' }).click()
  await expect(page.getByRole('heading', { name: 'Review before submitting' })).toBeVisible()
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page).toHaveURL(/\/sends\/.+/)
}

export const status = (page: Page) => page.getByRole('region', { name: 'Status' })
export const shot = (page: Page, info: TestInfo, name: string) => page.screenshot({ path: `e2e-shots/it-${info.project.name}-${name}.png` })
