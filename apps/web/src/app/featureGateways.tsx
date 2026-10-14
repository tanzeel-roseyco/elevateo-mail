// Optional feature capabilities handed to registered modules (FE-805). The V1 MailroomGateway
// stays frozen; Celeste's OutreachGateway arrives through this separate seam so her pages render
// their own honest "unavailable" state when it is absent. Lyra's administration pages bind
// Cassian's V2 gateway directly and need nothing here.
//
// AIDEV-NOTE: Absence is the production default until Cassian publishes an OutreachGateway adapter
// over V2 (see docs/completion/fable.md "Gateway reconciliation"). Never fabricate a capability here.
import { createContext, useContext, type ReactNode } from 'react'
import type { OutreachGateway } from '@/features/outreach/contract'

export interface FeatureGateways {
  readonly outreach?: OutreachGateway
}

const NONE: FeatureGateways = {}
const FeatureGatewaysContext = createContext<FeatureGateways>(NONE)

export function FeatureGatewaysProvider({ value, children }: { value: FeatureGateways; children: ReactNode }) {
  return <FeatureGatewaysContext.Provider value={value}>{children}</FeatureGatewaysContext.Provider>
}

/** No provider (isolated route test) reads as "nothing connected", the same as production today. */
export function useFeatureGateways(): FeatureGateways {
  return useContext(FeatureGatewaysContext)
}
