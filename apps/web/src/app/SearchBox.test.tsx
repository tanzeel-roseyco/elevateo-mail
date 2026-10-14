import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SearchBox } from './SearchBox'

function Harness() {
  const navigate = useNavigate()
  const location = useLocation()
  return <>
    <SearchBox expanded />
    <output aria-label="URL">{location.search}</output>
    <button onClick={() => navigate('/search?q=second&mailbox=unknown')}>Next URL</button>
    <button onClick={() => navigate(-1)}>Back</button>
  </>
}

function setup() {
  render(<MemoryRouter initialEntries={['/search?q=first']}><Harness /></MemoryRouter>)
  return screen.getByRole('searchbox', { name: 'Search mail' }) as HTMLInputElement
}

describe('search form URL ownership', () => {
  it('refreshes idle fields on navigation and history, including an unavailable scope', () => {
    const input = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Next URL' }))
    expect(input.value).toBe('second')
    expect((screen.getByRole('combobox', { name: 'Search scope' }) as HTMLSelectElement).value).toBe('unknown')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(input.value).toBe('first')
    expect((screen.getByRole('combobox', { name: 'Search scope' }) as HTMLSelectElement).value).toBe('')
  })

  it('preserves a focused edit during URL changes and refreshes after leaving the form', () => {
    const input = setup()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'unfinished' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next URL' }))
    expect(input.value).toBe('unfinished')
    fireEvent.blur(input)
    expect(input.value).toBe('second')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(input.value).toBe('first')
  })

  it('submits literal query and scope in the URL and refuses an empty submission', () => {
    const input = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Next URL' }))
    fireEvent.change(input, { target: { value: '<img %' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(screen.getByLabelText('URL').textContent).toBe('?q=%3Cimg+%25&mailbox=unknown')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(screen.getByLabelText('URL').textContent).toBe('?q=%3Cimg+%25&mailbox=unknown')
  })
})
