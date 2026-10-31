import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { InstallApp } from './InstallApp'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
})
afterEach(() => vi.unstubAllGlobals())
function offer(outcome: 'accepted' | 'dismissed', fail = false) {
  const event = new Event('beforeinstallprompt', { cancelable: true })
  const prompt = vi.fn(() => fail ? Promise.reject(new Error('Unavailable')) : Promise.resolve())
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) })
  act(() => { window.dispatchEvent(event) })
  return prompt
}
it('opens the platform prompt only after a user action and hides after acceptance', async () => {
  render(<InstallApp />)
  expect(screen.getByRole('button', { name: 'Install app' })).toHaveProperty('disabled', true)
  const prompt = offer('accepted')
  expect(prompt).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Install app' }))
  await waitFor(() => expect(screen.queryByRole('note', { name: 'Install Elevateo Mail' })).toBeNull())
  expect(prompt).toHaveBeenCalledTimes(1)
})
it('remembers dismissal, restores keyboard focus and retains manual help', async () => {
  render(<InstallApp />)
  offer('dismissed')
  fireEvent.click(screen.getByRole('button', { name: 'Install app' }))
  await waitFor(() => expect(localStorage.getItem('elevateo.pwa.install-dismissed')).toBe('1'))
  expect(document.activeElement?.textContent).toBe('Install help')
  offer('accepted')
  expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull()
})
it('explains a failed platform prompt without trapping the user', async () => {
  render(<InstallApp />)
  offer('accepted', true)
  fireEvent.click(screen.getByRole('button', { name: 'Install app' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Installation did not open'))
  expect(screen.getByRole('button', { name: 'Install app' })).toHaveProperty('disabled', true)
})
it('hides installation UI when already standalone', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  render(<InstallApp />)
  expect(screen.queryByRole('note', { name: 'Install Elevateo Mail' })).toBeNull()
})
