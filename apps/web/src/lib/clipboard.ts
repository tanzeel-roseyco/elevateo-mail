// Clipboard writes for "Copy", "Copy for LLM" and code-block copy buttons. Returns false instead of
// throwing so callers can show "Copy failed" inline; the async Clipboard API is the only path used
// (document.execCommand is deprecated and silently no-ops in modern browsers).
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
