import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesktopPreviewNotice } from './DesktopPreviewNotice'

afterEach(() => { cleanup(); vi.unstubAllEnvs() })
describe('DesktopPreviewNotice', () => {
  it('labels the native preview honestly', () => {
    vi.stubEnv('VITE_DESKTOP_PREVIEW', 'true')
    render(<DesktopPreviewNotice />)
    expect(screen.getByRole('note')).toHaveTextContent('Fictional inbox preview — live drafts only through the separate handoff')
  })
  it('does not label normal web builds as desktop previews', () => {
    vi.stubEnv('VITE_DESKTOP_PREVIEW', '')
    render(<DesktopPreviewNotice />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
