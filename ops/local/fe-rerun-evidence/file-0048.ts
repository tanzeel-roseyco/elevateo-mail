// Entry routing shared by the production and fixture mains. Pure so it can be unit tested.

// AIDEV-NOTE: /auth/complete is the fixed query-free completion form the server redirects to after
// staging an invite/recovery link (BE-02A). It is a real pathname, not a hash route, so the host
// must serve the same SPA index for it. The page never reads the URL; the pending entry is a cookie.
export function isAuthCompletePath(pathname: string): boolean {
  return pathname === '/auth/complete' || pathname === '/auth/complete/'
}
