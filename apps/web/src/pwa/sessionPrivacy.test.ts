import { afterEach, expect, it, vi } from 'vitest'
import { clearSessionRecords, SESSION_CLEARED_EVENT } from './sessionPrivacy'

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear() })
it('clears session records in both stores without deleting other apps or install preferences', () => {
  localStorage.setItem('elevateo.settings.account', 'private')
  sessionStorage.setItem('elevateo.approval-recovery.v1', 'binding')
  localStorage.setItem('unrelated', 'keep')
  localStorage.setItem('elevateo.pwa.install-dismissed', '1')
  clearSessionRecords()
  expect(localStorage.getItem('elevateo.settings.account')).toBeNull()
  expect(sessionStorage.length).toBe(0)
  expect(localStorage.getItem('unrelated')).toBe('keep')
  expect(localStorage.getItem('elevateo.pwa.install-dismissed')).toBe('1')
})
it('invalidates memory even if a browser denies storage deletion', () => {
  const listener = vi.fn()
  window.addEventListener(SESSION_CLEARED_EVENT, listener)
  localStorage.setItem('elevateo.settings.account', 'private')
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Blocked') })
  expect(clearSessionRecords).toThrow('Local session records could not be cleared')
  expect(listener).toHaveBeenCalledOnce()
  window.removeEventListener(SESSION_CLEARED_EVENT, listener)
})
it('still clears session storage when local storage is inaccessible', () => {
  sessionStorage.setItem('elevateo.approval-recovery.v1', 'binding')
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('Blocked') })
  expect(clearSessionRecords).toThrow()
  expect(sessionStorage.length).toBe(0)
})
it('detects a silent storage deletion failure', () => {
  localStorage.setItem('elevateo.settings.account', 'private')
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {})
  expect(clearSessionRecords).toThrow('Local session records could not be cleared')
})
