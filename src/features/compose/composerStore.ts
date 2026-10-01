import { create } from 'zustand'
import { useData } from '@/data/store'
import type { Draft } from '@/domain/schema'
import { uid } from '@/lib/format'

// AIDEV-NOTE: One floating composer at a time. Opening another saves the current one as a draft (see Composer cleanup).

export type ComposerMode = 'normal' | 'minimised' | 'expanded'

interface ComposerState {
  draft: Draft | null
  mode: ComposerMode
  setMode(mode: ComposerMode): void
  close(): void
}

export const useComposer = create<ComposerState>()((set) => ({
  draft: null,
  mode: 'normal',
  setMode: (mode) => set({ mode }),
  close: () => set({ draft: null, mode: 'normal' }),
}))

/** Opens a new message, optionally pre-filled (reply, forward, "email this contact"). */
export function openComposer(init: Partial<Draft> = {}): void {
  const { settings, identities } = useData.getState()
  const identityId = init.identityId ?? settings.defaultIdentityId
  const identity = identities.find((i) => i.id === identityId)
  useComposer.setState({
    mode: 'normal',
    draft: {
      id: uid('d'),
      identityId,
      to: [],
      cc: [],
      bcc: [],
      subject: '',
      body: '',
      attachments: [],
      campaignId: null,
      threadId: null,
      banner: identity?.banner ?? false,
      updatedAt: new Date().toISOString(),
      ...init,
    },
  })
}

export function openDraft(draft: Draft): void {
  useComposer.setState({ draft, mode: 'normal' })
}
