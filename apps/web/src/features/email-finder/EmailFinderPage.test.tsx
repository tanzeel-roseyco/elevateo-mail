import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import type { EmailFinderGateway, FinderJob } from './contract'
import { EmailFinderPage } from './EmailFinderPage'
import { ResultView } from './FinderResults'

const harness = vi.hoisted(() => ({ gateway: undefined as EmailFinderGateway | undefined,
  context: { contextId: 'context_0123456789', authorizationVersion: 'version_0123456789' },
  request: async <T,>(work: (ctx: { contextId: string; authorizationVersion: string }, signal: AbortSignal) => Promise<T>) => {
    try { return { kind: 'ok' as const, value: await work({ contextId: 'context_0123456789', authorizationVersion: 'version_0123456789' }, new AbortController().signal) } }
    catch (error) { return { kind: 'failed' as const, error } }
  },
}))
vi.mock('@/app/featureGateways', () => ({ useFeatureGateways: () => ({ emailFinder: harness.gateway }) }))
vi.mock('@/app/protectedRequest', () => ({ useProtectedRequest: () => ({ context: harness.context, proof: { csrfToken: 'proof' }, request: harness.request }) }))
const job: FinderJob = { id: '00000000-0000-4000-8000-000000000001', kind: 'person', status: 'queued',
  total: 1, completed: 0, created_at: '2026-10-29T00:00:00Z', items: [] }
const health = { smtp_available: false, smtp_reason: 'Connection timed out on port 25', ehlo_hostname: null,
  remaining_daily_probes: 49, halted_until: null, worker_seen_at: null }
const open = (path = '/email-finder') => render(<MemoryRouter initialEntries={[path]}><EmailFinderPage /></MemoryRouter>)
beforeEach(() => {
  harness.gateway = {
    jobs: vi.fn(async () => ({ items: [] })), job: vi.fn(async () => job), create: vi.fn(async () => job),
    export: vi.fn(async () => ({ csv: 'email,status\n' })), health: vi.fn(async () => health),
    suppressions: vi.fn(async () => ({ items: [] })), suppress: vi.fn(), unsuppress: vi.fn(),
  }
})
afterEach(cleanup)

describe('email finder workspace', () => {
  // AIDEV-NOTE: Selection needs a structural cue as well as the subtle neutral surface fill.
  it('distinguishes only the current mode with a thicker border and text weight', async () => {
    open('/email-finder?mode=jobs')
    await screen.findByText(/Connection timed out on port 25/)
    const current = document.querySelector('a[aria-current="page"]')
    expect(current?.classList.contains('border-b-2')).toBe(true)
    expect(current?.classList.contains('font-semibold')).toBe(true)
    const otherModes = Array.from(document.querySelectorAll('nav a:not([aria-current="page"])'))
    expect(otherModes.length).toBeGreaterThan(0)
    for (const link of otherModes) expect(link.classList.contains('border-b-2')).toBe(false)
  })
  it('queues a person and exposes persisted progress', async () => {
    open()
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Alex Morgan' } })
    fireEvent.change(screen.getByLabelText('Company domain'), { target: { value: 'example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start lookup' }))
    await screen.findByText('queued · 0 of 1 rows processed')
    expect(harness.gateway?.create).toHaveBeenCalledWith({ kind: 'person', rows: [{ name: 'Alex Morgan', domain: 'example.com' }], csv: null }, expect.anything(), expect.anything(), expect.anything())
  })
  it('shows exact SMTP unavailability while leaving discovery usable', async () => {
    open()
    await screen.findByText(/Connection timed out on port 25/)
    expect(screen.getByRole('button', { name: 'Start lookup' }).hasAttribute('disabled')).toBe(false)
  })
  it('announces global reputation backoff', async () => {
    if (harness.gateway) harness.gateway.health = vi.fn(async () => ({ ...health, halted_until: new Date(Date.now() + 86_400_000).toISOString() }))
    open()
    await screen.findByText('SMTP probing paused')
    expect(screen.getByRole('alert').textContent).toContain('blocklist')
  })
  it('does not announce an expired SMTP pause as active', async () => {
    if (harness.gateway) harness.gateway.health = vi.fn(async () => ({ ...health, halted_until: '2000-01-01T00:00:00Z' }))
    open()
    await screen.findByText(/Connection timed out on port 25/)
    expect(screen.queryByText('SMTP probing paused')).toBeNull()
  })
  it('does not claim company emails were absent when discovery sources were unavailable', () => {
    render(<ResultView result={{ status: 'sources_unavailable', confidence: 0, emails: [],
      reasons: ['Search engines blocked'], sources: [], checked_at: '2026-10-29T00:00:00Z' }} />)
    expect(screen.getByText('Public sources are unavailable; company email discovery could not be completed.')).toBeTruthy()
    expect(screen.queryByText('No public company email addresses found.')).toBeNull()
  })
  it('rejects missing company without queuing', async () => {
    open()
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Alex Morgan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start lookup' }))
    await screen.findByText(/Check the required fields/)
    expect(harness.gateway?.create).not.toHaveBeenCalled()
  })
  it('shows recoverable load errors instead of empty success', async () => {
    if (harness.gateway) harness.gateway.health = vi.fn(async () => { throw new Error('offline') })
    open()
    await screen.findByText(/Could not load finder data/)
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy()
  })
  it('does not simulate an absent port', () => {
    harness.gateway = undefined
    open()
    expect(screen.getByText('Email finder unavailable')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start lookup' })).toBeNull()
  })
  it('clears a recovered load failure after a successful refresh', async () => {
    if (harness.gateway) harness.gateway.health = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(health)
    open()
    await screen.findByText(/Could not load finder data/)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await screen.findByText(/Connection timed out on port 25/)
    expect(screen.queryByText(/Could not load finder data/)).toBeNull()
  })
  it('keeps suppressions loading until the first read resolves', async () => {
    let finish: (value: { items: [] }) => void = () => {}
    if (harness.gateway) harness.gateway.suppressions = vi.fn(() => new Promise<{ items: [] }>((resolve) => { finish = resolve }))
    open('/email-finder?mode=suppressions')
    expect(screen.getByText('Loading suppressions…')).toBeTruthy()
    expect(screen.queryByText('No suppressions recorded.')).toBeNull()
    finish({ items: [] })
    await screen.findByText('No suppressions recorded.')
    expect(screen.queryByText('Loading suppressions…')).toBeNull()
  })
  it('switches tools through URL navigation and validates verifier fields', async () => {
    open('/email-finder?mode=verify')
    expect(screen.getByLabelText('Email address')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Decision makers' }))
    await waitFor(() => { expect(screen.getByLabelText('Role or title')).toBeTruthy() })
    expect(screen.queryByLabelText('Email address')).toBeNull()
  })
  it('renders hostile discovery text inertly', () => {
    const { container } = render(<ResultView result={{ status: 'sources_unavailable', confidence: 0,
      reasons: ['<img src=x onerror=alert(1)>'], sources: ['javascript:alert(1)'], checked_at: '2026-10-29T00:00:00Z' }} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy()
  })
})
