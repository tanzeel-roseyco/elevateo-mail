import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { createSeed } from '@/data/seed'
import { awaitingResponse, lastMessage } from '@/domain/mail'
import { threadHref } from '@/lib/routes'
import { NextUp } from './NextUp'

const seed = createSeed(Date.now())

describe('NextUp', () => {
  it('puts the longest-waiting conversation first and links straight to it', () => {
    const waiting = awaitingResponse(seed.threads)
    const oldest = waiting[waiting.length - 1]!
    render(
      <MemoryRouter>
        <NextUp waiting={waiting} campaigns={[]} draftCount={2} />
      </MemoryRouter>,
    )
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', threadHref(oldest))
    expect(links[0]).toHaveTextContent(`Reply to ${lastMessage(oldest).from.name}`)
    expect(screen.getByRole('link', { name: /Finish 2 drafts/ })).toHaveAttribute('href', '/mail/drafts')
  })

  it('lists a paused campaign as work and leaves a completed one out', () => {
    const base = seed.campaigns[0]!
    const paused = { ...base, id: 'c-paused', name: 'Paused one', status: 'paused' as const }
    const completed = { ...base, id: 'c-done', name: 'Finished one', status: 'completed' as const }
    render(
      <MemoryRouter>
        <NextUp waiting={[]} campaigns={[paused, completed]} draftCount={0} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /Resume or review “Paused one”/ })).toHaveAttribute('href', '/campaigns/c-paused')
    expect(screen.queryByText(/Finished one/)).not.toBeInTheDocument()
  })

  it('keeps a paused campaign visible when four draft campaigns precede it in the stored order', () => {
    const base = seed.campaigns[0]!
    const drafts = [1, 2, 3, 4].map((n) => ({ ...base, id: `c-draft-${n}`, name: `Draft ${n}`, status: 'draft' as const }))
    const paused = { ...base, id: 'c-paused', name: 'Stalled one', status: 'paused' as const }
    render(
      <MemoryRouter>
        <NextUp waiting={[]} campaigns={[...drafts, paused]} draftCount={0} />
      </MemoryRouter>,
    )
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(4)
    expect(links[0]).toHaveAttribute('href', '/campaigns/c-paused')
    // Five tasks, four shown: the one cut is a draft, and the overflow is acknowledged.
    expect(screen.queryByText(/Draft 4/)).not.toBeInTheDocument()
    expect(screen.getByText(/1 more below/)).toBeInTheDocument()
  })

  it('says so when nothing needs attention', () => {
    render(
      <MemoryRouter>
        <NextUp waiting={[]} campaigns={[]} draftCount={0} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Nothing needs you right now/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
