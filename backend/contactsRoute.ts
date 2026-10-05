import { z } from 'zod'
import { ApiError } from './core'

// AIDEV-NOTE: Contacts remain owner-scoped; sticky suppression overrides later imported consent.
export async function contactsRoute(request: Request, path: string, owner: string, db: D1Database): Promise<Response | null> {
  if (path !== '/v1/contacts' || request.method !== 'GET') return null
  const params = new URL(request.url).searchParams
  if (new Set(params.keys()).size !== [...params.keys()].length) throw new ApiError('validation_failed')
  const query = z.object({ after: z.email().max(254).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25) }).strict().parse(Object.fromEntries(params))
  const result = await db.prepare(`SELECT c.email,c.consent_source,c.opted_in,s.reason AS suppression
    FROM contacts c LEFT JOIN suppressions s ON s.owner=c.owner AND s.email=c.email
    WHERE c.owner=? AND c.email>? ORDER BY c.email LIMIT ?`)
    .bind(owner, query.after ?? '', query.limit + 1)
    .all<{ email: string; consent_source: string; opted_in: number; suppression: string | null }>()
  const items = result.results.slice(0, query.limit)
  return Response.json({ items, next: result.results.length > query.limit ? items.at(-1)!.email : null })
}
