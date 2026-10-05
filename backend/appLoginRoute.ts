import { z } from 'zod'
import { ApiError, jsonBody } from './core'
import { loginCookieName, type AppLogin } from './appLogin'

// AIDEV-NOTE: Cross-site callback renders only a handoff; Strict cookies return on its same-origin POST.
export async function appLoginRoute(request: Request, service?: Pick<AppLogin, 'begin' | 'complete'>): Promise<Response | null> {
  const url = new URL(request.url)
  if (!['/v1/login/begin', '/v1/login/complete', '/login/callback'].includes(url.pathname)) return null
  if (!service) throw new ApiError('login_disabled', 503)
  const headers = new Headers({ 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff' })
  if (url.pathname === '/login/callback' && request.method === 'GET') {
    if (request.url.length > 16_384) throw new ApiError('login_callback_invalid')
    const nonce = crypto.randomUUID()
    headers.set('content-type', 'text/html; charset=utf-8')
    headers.set('content-security-policy', `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`)
    return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Completing sign in</title><p id="status" role="status">Completing sign in…</p><script nonce="${nonce}">
const callbackUrl=location.href;history.replaceState(null,'','/login/callback');
fetch('/v1/login/complete',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({callbackUrl})})
.then(response=>{if(!response.ok)throw Error();location.replace('/')})
.catch(()=>{document.getElementById('status').textContent='Sign in failed. Return to the application and try again.'});
</script></html>`, { headers })
  }
  if (request.method !== 'POST' || url.pathname === '/login/callback') throw new ApiError('method_not_allowed', 405)
  if (url.search || request.headers.get('origin') !== url.origin ||
    (request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin')) throw new ApiError('csrf_failed', 403)
  if (url.pathname === '/v1/login/begin') {
    z.object({}).strict().parse(await jsonBody(request))
    const result = await service.begin()
    headers.append('set-cookie', result.nonceCookie)
    return Response.json({ authorizationUrl: result.authorizationUrl, expiresAt: result.expiresAt }, { headers })
  }
  const input = z.object({ callbackUrl: z.string().url().max(16_384) }).strict().parse(await jsonBody(request))
  const cookies = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim())
    .filter(value => value.startsWith(loginCookieName + '='))
  if (cookies.length !== 1) throw new ApiError('login_state_invalid')
  const result = await service.complete(input.callbackUrl, cookies[0]!.slice(loginCookieName.length + 1))
  headers.append('set-cookie', result.sessionCookie); headers.append('set-cookie', result.clearNonceCookie)
  return Response.json({ signedIn: true, accountId: result.accountId, expiresAt: result.expiresAt }, { headers })
}
