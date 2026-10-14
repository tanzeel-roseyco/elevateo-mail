// Optional feature capabilities handed to registered modules (FE-805). The V1 MailroomGateway
// stays frozen; Celeste's OutreachGateway arrives through this separate seam so her pages render
// their own honest "unavailable" state when it is absent. Lyra's administration pages bind
// Cassian's V2 gateway directly and need nothing here.
//
// AIDEV-NOTE: The production entry injects implemented V2 ports; isolated hosts may omit them.
// An omitted capability must stay unavailable rather than switch to fixture data.
import { createContext, useContext, type ReactNode } from 'react'
import type { OutreachGateway } from '@/features/outreach/contract'
import type { DirectMessageRead } from '@/features/thread/ThreadPage'
import type { AssigneeOptionsReadPort } from '@/data/v2AssigneeOptionsGateway'
import type { AttachmentReadPort } from '@/features/thread/MessageAttachments'

export interface FeatureGateways {
  readonly outreach?: OutreachGateway
  /**
   * Cassian's exact V2 `getDirectMessage(ctx, mailboxId, threadId, messageId, signal)` reader for
   * a message URL beyond the loaded thread page. Mira's ThreadPage applies the shared session
   * policy itself (generation at call time, handleError on failure); binding it a second time here
   * would spend the single bounded refresh twice, so this seam carries the raw reader.
   */
  readonly readDirectMessage?: DirectMessageRead
  /** Protected mailbox-scoped SQL backs the candidate route; exact fleet proof remains pending. */
  readonly assigneeOptions?: AssigneeOptionsReadPort
  /** Isolated candidate private read port; real byte, scan and scope fleet proof remains pending. */
  readonly attachmentPort?: AttachmentReadPort
}

const NONE: FeatureGateways = {}
const FeatureGatewaysContext = createContext<FeatureGateways>(NONE)

export function FeatureGatewaysProvider({ value, children }: { value: FeatureGateways; children: ReactNode }) {
  return <FeatureGatewaysContext.Provider value={value}>{children}</FeatureGatewaysContext.Provider>
}

/** No provider (isolated route test) reads as "nothing connected". */
export function useFeatureGateways(): FeatureGateways {
  return useContext(FeatureGatewaysContext)
}
