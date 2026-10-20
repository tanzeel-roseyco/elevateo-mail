// Bounded organization list for the workspace switcher (BE-02A). Read only while the switcher is
// open, follows cursors with one reset budget and caps the page count; an incomplete list is
// reported honestly rather than silently truncated.
// AIDEV-NOTE: Extracted from the former AccountSheet so the Flux-style switcher reuses the exact
// traversal rules (D4) instead of re-deriving them.
import { useEffect, useState } from 'react'
import type { Organization, OrganizationPage } from '@/data/contract'
import { GatewayError } from '@/data/errors'
import { newTraversalBudget, readPage } from '@/lib/readPage'
import { useGateway, useSession } from './session'

/** Own memberships are few (ten-person product); this bound keeps memory and requests finite. */
export const MAX_ORGANIZATION_PAGES = 20

export type OrganizationsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; items: Organization[]; incomplete: boolean }
  | { status: 'error'; message: string }

export function useOrganizations(enabled: boolean, attempt: number): OrganizationsState {
  const gateway = useGateway()
  const { scope, context, handleError } = useSession()
  const [state, setState] = useState<OrganizationsState>({ status: 'idle' })

  useEffect(() => {
    if (!enabled || !context) {
      setState({ status: 'idle' })
      return
    }
    const generation = scope.current()
    const controller = new AbortController()
    const isCurrent = () => scope.isCurrent(generation) && !controller.signal.aborted
    setState({ status: 'loading' })
    const loadAll = async () => {
      // One reset budget for the whole traversal (D4); pages are bounded so a server that keeps
      // returning cursors cannot grow memory without limit.
      const budget = newTraversalBudget()
      let items: Organization[] = []
      const seen = new Set<string>()
      let cursor: string | undefined
      let pages = 0
      do {
        const outcome = await readPage<OrganizationPage>({
          read: (c) => gateway.listOrganizations(context, c === undefined ? {} : { cursor: c }, controller.signal),
          cursor,
          budget,
          isCurrent,
        })
        if (outcome.kind === 'stale') return
        if (outcome.kind === 'failed') {
          if (!isCurrent() || handleError(outcome.error, generation)) return
          setState({ status: 'error', message: outcome.error instanceof GatewayError ? outcome.error.message : 'Workspaces could not be loaded.' })
          return
        }
        if (outcome.replace) {
          items = []
          seen.clear()
        }
        for (const organization of outcome.page.items) {
          if (!seen.has(organization.id)) {
            seen.add(organization.id)
            items.push(organization)
          }
        }
        cursor = outcome.page.next_cursor ?? undefined
        pages += 1
      } while (cursor !== undefined && pages < MAX_ORGANIZATION_PAGES)
      if (!isCurrent()) return
      setState({ status: 'ready', items, incomplete: cursor !== undefined })
    }
    void loadAll()
    return () => controller.abort()
  }, [enabled, context, gateway, scope, handleError, attempt])

  return state
}
