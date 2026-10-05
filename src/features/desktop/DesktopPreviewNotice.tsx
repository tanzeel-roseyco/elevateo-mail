import { DesktopDraftHandoff } from './DesktopDraftHandoff'
// AIDEV-NOTE: Native packaging forces this flag; keep fictional desktop behavior visibly distinct from live web mail.
export function DesktopPreviewNotice() {
  if (import.meta.env.VITE_DESKTOP_PREVIEW !== 'true') return null
  return <><div role="note" className="shrink-0 border-b border-line bg-surface px-3 py-2 text-center text-xs text-fg">
    Fictional inbox preview — live drafts only through the separate handoff
  </div><DesktopDraftHandoff /></>
}
