// AIDEV-NOTE: Validate the raw target before URL normalization can erase traversal evidence.
export type Route = { kind: 'api' | 'static'; path: string } | { kind: 'reject'; status: number };
export function routeRequest(host: string | undefined, target: string, expectedHost = 'app.test'): Route {
  if (host !== expectedHost) return { kind: 'reject', status: 421 };
  if (target.length > 8192) return { kind: 'reject', status: 414 };
  if (!target.startsWith('/') || target.startsWith('//') || /[\x00-\x20\x7f#\\]/.test(target))
    return { kind: 'reject', status: 400 };
  const rawPath = target.split('?')[0] ?? '';
  let path: string;
  try { path = decodeURIComponent(rawPath); }
  catch { return { kind: 'reject', status: 400 }; }
  if (/[\x00-\x20\x7f\\%]/.test(path) || path.includes('//') || path.split('/').some(part => part.startsWith('.')))
    return { kind: 'reject', status: 400 };
  if (path === '/src' || path.startsWith('/src/') || path === '/dev-fixtures.html')
    return { kind: 'reject', status: 404 };
  // AIDEV-NOTE: Both contract versions share the API authority; preserve queries for boundary validation.
  if (path.startsWith('/v1/') || path.startsWith('/v2/') || path === '/auth/accept')
    return { kind: 'api', path: target };
  // AIDEV-NOTE: The product uses HashRouter; only these document routes need the production index.
  if (['/', '/index.html', '/auth/complete', '/auth/complete/'].includes(path))
    return { kind: 'static', path: '/index.html' };
  if (path === '/v1' || path === '/v2' || path.startsWith('/auth/')) return { kind: 'reject', status: 404 };
  return { kind: 'static', path };
}
