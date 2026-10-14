import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { GatewayError } from '@/data/errors'
import { OutreachSequencePage } from './SequencePage'
import type { OutreachGateway } from './contract'
import { sequencePutSchema, sequenceSchema, type SequencePut } from './sequenceContract'

const campaignId = '1a40d184-987d-4b50-98d2-f674e41842f9'
const sequenceId = '7206b079-7c79-4d06-a025-d80649b39573'
const stepId = '916e62dd-bf2b-4b69-8c38-24cad803415e'
const context = { contextId: 'ctx', authorizationVersion: '1' }
const proof = { csrfToken: 'test-proof' }
const saved = {
  id: sequenceId, campaign_id: campaignId, version: 1, status: 'draft', timezone: 'UTC',
  steps: [{ id: stepId, position: 1, delay_seconds: 0, local_time: '09:00:00', label: 'Introduction' }],
}
function view(overrides: Partial<OutreachGateway>) {
  const gateway = overrides as OutreachGateway
  return render(<MemoryRouter initialEntries={['/outreach/campaigns/' + campaignId + '/sequence']}><Routes>
    <Route path="/outreach/campaigns/:campaignId/sequence" element={<OutreachSequencePage gateway={gateway} context={context} proof={proof} />} />
  </Routes></MemoryRouter>)
}

describe('campaign sequence editor candidate', () => {
  it('validates bounded ordered steps and a nullable create version', () => {
    expect(sequenceSchema.safeParse(saved).success).toBe(true)
    expect(sequencePutSchema.safeParse({ ...saved, version: undefined, operation_id: sequenceId, expected_version: null }).success).toBe(false)
    const input = { id: sequenceId, campaign_id: campaignId, status: 'draft', timezone: 'UTC', steps: saved.steps }
    expect(sequencePutSchema.safeParse({ ...input, operation_id: sequenceId, expected_version: null }).success).toBe(true)
    expect(sequencePutSchema.safeParse({ ...input, operation_id: sequenceId, expected_version: null, steps: [{ ...saved.steps[0], delay_seconds: 2_592_001 }] }).success).toBe(false)
  })
  it('creates an inert draft after a generic 404 and reloads the saved version', async () => {
    const getOutreachSequenceDraft = vi.fn().mockRejectedValueOnce(new GatewayError('api', 'not_available', 'absent', { status: 404 })).mockResolvedValue(saved)
    const saveOutreachSequenceDraft = vi.fn(async (_ctx: unknown, _proof: unknown, _campaignId: unknown, input: SequencePut) => ({
      ...saved, id: input.id, version: 1, steps: input.steps,
    }))
    view({ getOutreachSequenceDraft, saveOutreachSequenceDraft })
    expect(await screen.findByText(/No accessible sequence draft was returned/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create draft sequence' }))
    expect(saveOutreachSequenceDraft).toHaveBeenCalledWith(context, proof, campaignId, expect.objectContaining({
      campaign_id: campaignId, expected_version: null, status: 'draft', timezone: 'UTC', operation_id: expect.any(String),
    }), expect.any(AbortSignal))
    expect(await screen.findByText(/Saved version 1; draft/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /send|enroll/i })).toBeNull()
  })
  it('keeps the saved version visible and blocks replay after a 409 conflict', async () => {
    const saveOutreachSequenceDraft = vi.fn(async () => { throw new GatewayError('api', 'operation_mismatch', 'conflict', { status: 409 }) })
    view({ getOutreachSequenceDraft: vi.fn(async () => saved), saveOutreachSequenceDraft })
    await screen.findByText(/Saved version 1; draft/)
    fireEvent.click(screen.getByRole('button', { name: 'Save sequence' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringMatching(/Inspect the saved sequence/))
    expect(screen.getByText(/Saved version 1; draft/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Save sequence' }) as HTMLButtonElement).disabled).toBe(true)
    expect(saveOutreachSequenceDraft).toHaveBeenCalledTimes(1)
  })
  it('hides loaded sequence content after a denied write', async () => {
    const saveOutreachSequenceDraft = vi.fn(async () => { throw new GatewayError('api', 'not_available', 'denied', { status: 404 }) })
    view({ getOutreachSequenceDraft: vi.fn(async () => saved), saveOutreachSequenceDraft })
    await screen.findByText(/Saved version 1; draft/)
    fireEvent.click(screen.getByRole('button', { name: 'Save sequence' }))
    expect(await screen.findByText(/Sequence access changed/)).toBeTruthy()
    expect(screen.queryByText(/Saved version 1; draft/)).toBeNull()
  })
})
