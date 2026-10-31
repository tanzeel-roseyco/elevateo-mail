// Regression tests for the primitive findings from the bounded reviews: menu dismissal with no
// items, breadcrumb list structure, code-point initials, repeated copy feedback, tooltip Escape and
// button-tab focus movement.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initialsOf } from './Avatar'
import { Breadcrumbs } from './Breadcrumbs'
import { CodeBlock, CopyButton } from './CodeBlock'
import { Menu, MenuItem } from './Menu'
import { Modal } from './Modal'
import { PageHeader } from './PageHeader'
import { GetHelpMenu } from './GetHelpMenu'
import { ButtonTabs, LinkTabs } from './Tabs'
import { Tooltip } from './Tooltip'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Menu', () => {
  it('closes on Escape and returns focus to the trigger even when it has no items', () => {
    render(
      <Menu label="Empty" trigger={<button type="button">Open</button>}>
        {null}
      </Menu>,
    )
    const trigger = screen.getByRole('button', { name: 'Open' })
    fireEvent.click(trigger)
    const panel = screen.getByRole('menu', { name: 'Empty' })
    fireEvent.keyDown(panel, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('keeps a caller-supplied trigger ref working', () => {
    const seen: HTMLButtonElement[] = []
    render(
      <Menu label="Ref" trigger={<button type="button" ref={(node) => { if (node) seen.push(node) }}>Open</button>}>
        <MenuItem onSelect={() => undefined}>One</MenuItem>
      </Menu>,
    )
    expect(seen[0]).toBe(screen.getByRole('button', { name: 'Open' }))
  })
})

function ModalHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
      <Modal open={open} onOpenChange={setOpen} title="Example">
        <p>Body</p>
      </Modal>
    </>
  )
}

describe('Modal', () => {
  // AIDEV-NOTE: A translucent semantic backdrop preserves context behind confirmation dialogs.
  it('keeps the underlying task visible through its backdrop', async () => {
    render(<ModalHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }))
    await screen.findByRole('dialog', { name: 'Example' })
    expect(document.querySelector('.bg-overlay')).not.toBeNull()
  })
  it('returns focus to the control that opened a trigger-less dialog', async () => {
    render(<ModalHarness />)
    const opener = screen.getByRole('button', { name: 'Open dialog' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = await screen.findByRole('dialog', { name: 'Example' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })
})

describe('GetHelpMenu', () => {
  it('returns focus to the Get Help button after the Live Chat dialog closes', async () => {
    render(
      <MemoryRouter>
        <GetHelpMenu />
      </MemoryRouter>,
    )
    const trigger = screen.getByRole('button', { name: 'Get Help' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Live Chat' }))
    const dialog = await screen.findByRole('dialog', { name: 'Live chat is not connected' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })
})

describe('LinkTabs', () => {
  it('gives only the current section the accent underline classes', () => {
    render(
      <MemoryRouter initialEntries={['/settings/profile/password']}>
        <LinkTabs label="Settings sections" tabs={[{ to: '/settings/workspace', label: 'Workspace', end: false }, { to: '/settings/profile', label: 'Profile', end: false }]} />
      </MemoryRouter>,
    )
    const profile = screen.getByRole('link', { name: 'Profile' })
    const workspace = screen.getByRole('link', { name: 'Workspace' })
    expect(profile.getAttribute('aria-current')).toBe('page')
    expect(profile.className).toContain('border-line')
    expect(profile.className).not.toContain('border-transparent')
    expect(workspace.className).toContain('border-transparent')
    expect(workspace.className).not.toContain('border-line')
  })
})

describe('CodeBlock', () => {
  it('keeps the Copy control on an opaque surface so scrolled code cannot show through it', () => {
    render(<CodeBlock code={'x'.repeat(400)} />)
    expect(screen.getByRole('button', { name: 'Copy' }).className).toContain('bg-surface-2')
    expect(document.querySelector('[aria-hidden].bg-surface-2')).not.toBeNull()
  })
})

describe('PageHeader', () => {
  it('wraps an unbroken 4096-character subtitle instead of widening the page', () => {
    render(<PageHeader title="Search results" subtitle={'x'.repeat(4096)} help={false} />)
    expect(screen.getByText(/^x+$/).className).toContain('wrap-anywhere')
  })
})

describe('Breadcrumbs', () => {
  it('renders only list items inside the ordered list', () => {
    render(
      <MemoryRouter>
        <Breadcrumbs crumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Tags' }]} />
      </MemoryRouter>,
    )
    const list = screen.getByRole('list')
    expect(Array.from(list.children).every((child) => child.tagName === 'LI')).toBe(true)
    expect(list.children).toHaveLength(2)
    expect(screen.getByText('Tags').getAttribute('aria-current')).toBe('page')
  })
})

describe('initialsOf', () => {
  it('takes whole code points so an emoji or CJK initial is never split', () => {
    expect(initialsOf('😀 Smith')).toBe('😀S')
    expect(initialsOf('Ada Lovelace')).toBe('AL')
    expect(initialsOf('   ')).toBe('?')
  })
})

describe('CopyButton', () => {
  it('restarts the confirmation timer when the same text is copied twice', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: () => Promise.resolve() } })
    render(<CopyButton text="abc" />)
    const button = screen.getByRole('button', { name: 'Copy' })
    await act(async () => {
      fireEvent.click(button)
    })
    expect(button.textContent).toBe('Copied')
    await act(async () => {
      vi.advanceTimersByTime(1500)
    })
    await act(async () => {
      fireEvent.click(button)
    })
    await act(async () => {
      vi.advanceTimersByTime(1500)
    })
    // 3s after the first click but only 1.5s after the second: still confirming.
    expect(button.textContent).toBe('Copied')
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(button.textContent).toBe('Copy')
  })
})

describe('Tooltip', () => {
  it('hides the bubble on Escape and shows it again after the pointer leaves', () => {
    render(
      <Tooltip label="Archive">
        <button type="button">A</button>
      </Tooltip>,
    )
    const trigger = screen.getByRole('button', { name: 'A' })
    expect(screen.getByText('Archive')).toBeTruthy()
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByText('Archive')).toBeNull()
    fireEvent.mouseLeave(trigger.parentElement!)
    expect(screen.getByText('Archive')).toBeTruthy()
  })
})

function TabHarness() {
  const [value, setValue] = useState<'a' | 'b'>('a')
  return <ButtonTabs<'a' | 'b'> label="Views" value={value} onChange={(key) => setValue(key)} tabs={[{ key: 'a', label: 'All' }, { key: 'b', label: 'Unread' }]} />
}

describe('ButtonTabs', () => {
  it('moves selection and focus together with the arrow keys', () => {
    render(<TabHarness />)
    const all = screen.getByRole('tab', { name: 'All' })
    all.focus()
    fireEvent.keyDown(all, { key: 'ArrowRight' })
    const unread = screen.getByRole('tab', { name: 'Unread' })
    expect(unread.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(unread)
  })
})
