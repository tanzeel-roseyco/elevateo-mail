import { create } from 'zustand'
import { defaultSettings } from '@/domain/identities'
import { dataSchema, type Campaign, type Contact, type Data, type Draft, type Identity, type Settings, type StoredFolder, type Thread } from '@/domain/schema'
import { createSeed } from './seed'

// AIDEV-NOTE: Client-side cache of mock entities. A real backend replaces data/mockGateway.ts; this store then
// becomes the cache its responses are written into. Components read via selectors, never localStorage directly.

export const STORAGE_KEY = 'mailroom:data:v1'

interface Actions {
  replaceAll(data: Data): void
  patchThreads(ids: string[], patch: Partial<Pick<Thread, 'starred' | 'unread' | 'folder'>>): void
  /** Restores each thread to the folder recorded before a move; used by Undo. */
  restoreFolders(previous: Record<string, StoredFolder>): void
  deleteThreads(ids: string[]): void
  upsertDraft(draft: Draft): void
  deleteDraft(id: string): void
  updateIdentity(id: string, patch: Partial<Pick<Identity, 'displayName' | 'signature' | 'banner'>>): void
  updateSettings(patch: Partial<Settings>): void
  updateContact(id: string, patch: Partial<Pick<Contact, 'subscription'>>): void
  updateCampaign(id: string, patch: Partial<Omit<Campaign, 'id'>>): void
  deleteCampaign(id: string): void
}

export type DataState = Data & Actions

export function emptyData(): Data {
  return { version: 1, threads: [], drafts: [], contacts: [], campaigns: [], events: [], identities: [], domains: [], settings: defaultSettings(new Date(0).toISOString()) }
}

const mapById = <T extends { id: string }>(items: T[], id: string, fn: (item: T) => T): T[] => items.map((item) => (item.id === id ? fn(item) : item))

export const useData = create<DataState>()((set) => ({
  ...emptyData(),
  replaceAll: (data) => set(data),
  patchThreads: (ids, patch) => set((s) => ({ threads: s.threads.map((t) => (ids.includes(t.id) ? { ...t, ...patch } : t)) })),
  restoreFolders: (previous) => set((s) => ({ threads: s.threads.map((t) => (previous[t.id] ? { ...t, folder: previous[t.id]! } : t)) })),
  deleteThreads: (ids) => set((s) => ({ threads: s.threads.filter((t) => !ids.includes(t.id)) })),
  upsertDraft: (draft) => set((s) => ({ drafts: s.drafts.some((d) => d.id === draft.id) ? mapById(s.drafts, draft.id, () => draft) : [draft, ...s.drafts] })),
  deleteDraft: (id) => set((s) => ({ drafts: s.drafts.filter((d) => d.id !== id) })),
  updateIdentity: (id, patch) => set((s) => ({ identities: mapById(s.identities, id, (i) => ({ ...i, ...patch })) })),
  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  updateContact: (id, patch) => set((s) => ({ contacts: mapById(s.contacts, id, (c) => ({ ...c, ...patch })) })),
  updateCampaign: (id, patch) => set((s) => ({ campaigns: mapById(s.campaigns, id, (c) => ({ ...c, ...patch })) })),
  // Nothing may keep pointing at a deleted campaign: its lifecycle events go with it, while kept conversations,
  // drafts, and send history become ordinary mail.
  deleteCampaign: (id) =>
    set((s) => {
      const unlink = <T extends { campaignId: string | null }>(item: T): T => (item.campaignId === id ? { ...item, campaignId: null } : item)
      return {
        campaigns: s.campaigns.filter((c) => c.id !== id),
        threads: s.threads.map(unlink),
        drafts: s.drafts.map(unlink),
        events: s.events.filter((e) => !(e.campaignId === id && e.kind === 'campaign')).map(unlink),
      }
    }),
}))

export function snapshot(state: DataState): Data {
  const { version, threads, drafts, contacts, campaigns, events, identities, domains, settings } = state
  return { version, threads, drafts, contacts, campaigns, events, identities, domains, settings }
}

export interface LoadResult {
  data: Data
  /** True when stored state existed but failed validation and was replaced by seed data. */
  recovered: boolean
}

/** Reads and validates persisted state; anything unreadable falls back to fresh seed data. */
export function loadPersisted(storage: Pick<Storage, 'getItem'>, now: number): LoadResult {
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    // Storage blocked (private mode / policy): run from seed data for this session.
    return { data: createSeed(now), recovered: false }
  }
  if (raw === null) return { data: createSeed(now), recovered: false }
  try {
    const parsed = dataSchema.safeParse(JSON.parse(raw))
    if (parsed.success) return { data: parsed.data, recovered: false }
  } catch {
    // Malformed JSON is handled the same way as a schema mismatch below.
  }
  return { data: createSeed(now), recovered: true }
}

let persistTimer: ReturnType<typeof setTimeout> | undefined
let persistenceStarted = false

/**
 * Starts debounced write-through to localStorage. `onError` fires once if a write fails.
 * A pending write is flushed when the page is hidden or closed, so a reload right after a change keeps it.
 */
export function startPersistence(onError: (message: string) => void): void {
  if (persistenceStarted) return
  persistenceStarted = true
  let warned = false
  let dirty = false
  const flush = () => {
    clearTimeout(persistTimer)
    if (!dirty) return
    dirty = false
    const data = snapshot(useData.getState())
    let saved = false
    try {
      // Never store state the loader would reject: that would silently reset everything on the next visit.
      if (dataSchema.safeParse(data).success) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
        saved = true
      }
    } catch {
      // Quota exceeded or storage blocked; reported below.
    }
    if (!saved && !warned) {
      warned = true
      onError('Changes could not be saved to this browser. They will be lost on reload.')
    }
  }
  useData.subscribe(() => {
    dirty = true
    clearTimeout(persistTimer)
    persistTimer = setTimeout(flush, 250)
  })
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}
