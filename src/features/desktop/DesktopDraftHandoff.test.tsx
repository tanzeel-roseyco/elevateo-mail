import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DesktopDraftHandoff } from './DesktopDraftHandoff'
const result = { provider: 'claude', binding: { accountId: 'a', mailboxId: 'm', requestId: 'r', sessionGeneration: 's', expiresAt: 1 }, draft: { subject: '<b>Plain</b>', body: '<script>private text</script>' } }
function install(invoke: ReturnType<typeof vi.fn>) {
  Object.defineProperty(window, '__TAURI__', { configurable: true, value: { core: { invoke } } })
}
afterEach(() => { cleanup(); Reflect.deleteProperty(window, '__TAURI__') })
function submit() {
  fireEvent.change(screen.getByLabelText('One-use handoff JSON'), { target: { value: '{"ticket":"fixture"}' } })
  fireEvent.click(screen.getByRole('button', { name: 'Prepare draft for review' }))
}
it('uses the fixed command, clears the ticket and renders only plain draft text', async () => {
  const invoke = vi.fn().mockResolvedValue(result); install(invoke)
  render(<DesktopDraftHandoff />); submit()
  await screen.findByRole('region', { name: 'Review generated draft' })
  expect(invoke).toHaveBeenCalledWith('prepare_draft', { handoff: '{"ticket":"fixture"}' })
  expect(screen.getByLabelText('One-use handoff JSON')).toHaveValue('')
  expect(screen.getByLabelText('Subject')).toHaveValue('<b>Plain</b>')
  expect(screen.getByLabelText('Draft body — select and copy')).toHaveValue('<script>private text</script>')
  fireEvent.click(screen.getByRole('button', { name: 'Clear private draft' }))
  expect(screen.queryByRole('region', { name: 'Review generated draft' })).not.toBeInTheDocument()
})
it('disables overlapping requests and hides untrusted failure details', async () => {
  let reject!: (error: Error) => void
  const invoke = vi.fn().mockImplementation(() => new Promise((_, failure) => { reject = failure })); install(invoke)
  render(<DesktopDraftHandoff />); submit()
  expect(screen.getByRole('button', { name: 'Preparing draft…' })).toBeDisabled()
  expect(invoke).toHaveBeenCalledTimes(1)
  reject(new Error('private path secret'))
  await screen.findByRole('alert')
  expect(screen.getByRole('alert')).not.toHaveTextContent('private path secret')
})
it('fails closed outside native app and for malformed native results', async () => {
  render(<DesktopDraftHandoff />); submit()
  expect(screen.getByRole('alert')).toHaveTextContent('installed Windows')
  install(vi.fn().mockResolvedValue({ draft: result.draft }))
  submit()
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Draft unavailable'))
  expect(screen.queryByRole('region', { name: 'Review generated draft' })).not.toBeInTheDocument()
})
