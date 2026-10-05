import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { isServerId } from '@/data/http/contract'

// AIDEV-NOTE: Shared by the inbox and the send-request list. The page position lives in the URL (?before=&beforeId=,
// the server's own cursor), so a reload or a shared link reopens the same page. The cursors of the pages walked
// through ride in history state, only to offer "Newer"; a link opened cold has no such trail and offers "Newest".

export interface PageCursor {
  before: number
  beforeId: string
}

const trailSchema = z.object({ trail: z.array(z.object({ before: z.number().int().nonnegative(), beforeId: z.string().refine(isServerId) })).max(500) })

function readCursor(params: URLSearchParams): PageCursor | null {
  const before = Number(params.get('before'))
  const beforeId = params.get('beforeId')
  if (!params.get('before') || !Number.isSafeInteger(before) || before < 0 || !beforeId || !isServerId(beforeId)) return null
  return { before, beforeId }
}
const cursorSearch = (cursor: PageCursor | undefined): string => (cursor ? `?before=${cursor.before}&beforeId=${cursor.beforeId}` : '')

export interface PagePosition {
  cursor: PageCursor | null
  /** Null when the page was opened from a link, so how many pages precede it is not known. */
  pageNumber: number | null
  /** Query string and history state to carry on links that should stay on this page. */
  search: string
  state: unknown
  older(listPath: string, next: PageCursor): void
  newer(listPath: string): void
}

export function usePagePosition(): PagePosition {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const cursor = readCursor(params)
  const parsed = trailSchema.safeParse(location.state)
  const walked = parsed.success ? parsed.data.trail : null
  // The trail is trusted only when it ends at the page the URL names; otherwise the position is simply not known.
  const trail = !cursor ? [] : walked && walked.at(-1)?.before === cursor.before && walked.at(-1)?.beforeId === cursor.beforeId ? walked : null
  return {
    cursor,
    pageNumber: trail ? trail.length + 1 : null,
    search: location.search,
    state: location.state,
    older: (listPath, next) => void navigate(`${listPath}${cursorSearch(next)}`, { state: trail && trail.length < 500 ? { trail: [...trail, next] } : null }),
    newer: (listPath) => void navigate(`${listPath}${cursorSearch(trail?.at(-2))}`, { state: trail ? { trail: trail.slice(0, -1) } : null }),
  }
}
