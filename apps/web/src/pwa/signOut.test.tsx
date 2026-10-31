import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { SessionProvider, useSession, type SessionController } from '@/app/session'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { GatewayError } from '@/data/errors'
import { resetSimulatedCache, useSimulatedStore } from '@/features/settings/simulatedStore'

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); resetSimulatedCache() })
const schema = z.string()
it.each(['success', 'rejected', 'network'] as const)('keeps cleanup warning and attempts server logout despite blocked deletion: %s', async (outcome) => {
  const base = createFixtureGateway()
  const logout = vi.fn(async () => {
    if (outcome === 'rejected') throw new GatewayError('api', 'unauthenticated', 'Session ended')
    if (outcome === 'network') throw new GatewayError('transport', 'network', 'Offline')
    return { local_revoked: true as const, upstream_status: 'complete' as const }
  })
  let controller: SessionController | undefined
  function Probe() {
    controller = useSession()
    return <p>{controller.state.status === 'error' || controller.state.status === 'sign_out_failed' ? controller.state.message : controller.state.status}</p>
  }
  render(<SessionProvider gateway={{ ...base, logout }}><Probe /></SessionProvider>)
  await screen.findByText('ready')
  localStorage.setItem('elevateo.settings.private', 'private')
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked') })
  await act(async () => { await controller!.signOut('local') })
  expect(logout).toHaveBeenCalledOnce()
  expect(screen.getByText(/Clear this site’s browser data/)).toBeTruthy()
})
it('clears subscribed simulated settings without rehydrating the previous value', async () => {
  let controller: SessionController | undefined
  let save: ((value: string) => void) | undefined
  function Probe() {
    controller = useSession()
    const store = useSimulatedStore('privacy-test', schema, 'empty')
    save = store.set
    return <p>{store.value}</p>
  }
  const base = createFixtureGateway()
  render(<SessionProvider gateway={base}><Probe /></SessionProvider>)
  await waitFor(() => expect(controller!.state.status).toBe('ready'))
  act(() => save!('private'))
  await screen.findByText('private')
  await act(async () => { await controller!.signOut('local') })
  await screen.findByText('empty')
  expect(localStorage.length).toBe(0)
  await act(async () => { controller!.refresh() })
  await waitFor(() => expect(controller!.state.status).toBe('ready'))
  expect(screen.queryByText('private')).toBeNull()
})
