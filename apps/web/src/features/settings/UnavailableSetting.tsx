// Explicit "not available" state for settings the server does not expose yet (tags, webhooks, API
// tokens, invitations, workspace rename, password). In the production entry these pages must never
// offer a form whose save goes nowhere; they show this EmailGuard empty-state card instead (icon,
// title, one-line explanation, primary action) and point at the nearest real capability.
//
// AIDEV-NOTE: `useSimulatedSettings` is the single switch: true only when the entry passes
// `simulatedSettings` through FeatureGateways (demo.html, dev-fixtures.html). The production
// main.tsx never does, so the browser-local adapters in simulatedStore.ts stay out of production.
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useFeatureGateways } from '@/app/featureGateways'
import { EmptyState } from '@/ui/Async'
import { buttonClass } from '@/ui/Button'

export function useSimulatedSettings(): boolean {
  return useFeatureGateways().simulatedSettings === true
}

interface UnavailableSettingProps {
  icon: ReactNode
  title: string
  /** One line: why it is unavailable and what the server would have to provide. */
  body: string
  /** Nearest real capability (defaults to Manage Members, the one server-backed workspace page). */
  action?: { to: string; label: string } | undefined
}

export function UnavailableSetting({ icon, title, body, action = { to: '/settings/workspace/members', label: 'Manage Members' } }: UnavailableSettingProps) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      body={body}
      action={<Link to={action.to} className={buttonClass('primary', 'md')}>{action.label}</Link>}
      className="mx-0 max-w-3xl"
    />
  )
}
