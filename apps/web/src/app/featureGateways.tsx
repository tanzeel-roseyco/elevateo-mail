// Optional feature capabilities handed to registered modules (FE-805). The V1 MailroomGateway
// stays frozen; Outreach reads (Celeste) and organization administration (Lyra) arrive through
// this separate seam so each feature renders its own honest "not connected" state when absent.
//
// AIDEV-NOTE: Absence is the production default until Cassian's V2 gateway and the owners' DTOs
// agree (see docs/completion/fable.md "Gateway reconciliation"). Never fabricate a capability here.
import { createContext, useContext, type ReactNode } from 'react'
import type { AdminGateway } from '@/features/members/adminModel'
import type { OutreachReads } from '@/features/outreach/contract'

export interface FeatureGateways {
  readonly outreach?: OutreachReads
  readonly admin?: AdminGateway
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
