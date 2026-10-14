import { Component, Suspense, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { Button } from '@/ui/Button'

// AIDEV-NOTE: Keep navigation/session guards outside this boundary; failed chunks must not strand the user.
class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override render() {
    if (this.state.failed) {
      return (
        <section className="space-y-3 p-6" role="alert">
          <h1 className="text-lg font-semibold">This page could not open</h1>
          <p>Choose another page or reload to try again. Reloading discards unsaved edits.</p>
          <Button onClick={() => window.location.reload()}>Reload page</Button>
        </section>
      )
    }
    return this.props.children
  }
}

export function PageBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  // AIDEV-NOTE: A new route clears the error; search changes retain the current page's form and filter state.
  return (
    <PageErrorBoundary key={pathname}>
      <Suspense fallback={<p role="status" className="p-6 text-muted">Loading page…</p>}>
        {children}
      </Suspense>
    </PageErrorBoundary>
  )
}
