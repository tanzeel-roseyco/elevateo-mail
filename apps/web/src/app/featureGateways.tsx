// Optional feature capabilities handed to registered modules (FE-805). The V1 MailroomGateway
// stays frozen; Celeste's OutreachGateway arrives through this separate seam so her pages render
// their own honest "unavailable" state when it is absent. Lyra's administration pages bind
// Cassian's V2 gateway directly and need nothing here.
//
// AIDEV-NOTE: The production entry injects implemented V2 ports; isolated hosts may omit them.
// An omitted capability must stay unavailable rather than switch to fixture data.
import { createContext, useContext, type ReactNode } from 'react'
import type { AgentsBridge } from '@/features/assistant/bridge'
import type { OutreachGateway } from '@/features/outreach/contract'
import type { DirectMessageRead } from '@/features/thread/ThreadPage'
import type { AssigneeOptionsReadPort } from '@/data/v2AssigneeOptionsGateway'
import type { AttachmentReadPort } from '@/features/thread/MessageAttachments'
import type { EmailFinderGateway } from '@/features/email-finder/contract'
import type { ConnectorGrantsGateway } from '@/data/connectorGrantsContract'
import type { DeliveryReportsGateway } from '@/data/deliveryReportsContract'
import type { createV2Gateway } from '@/data/v2Gateway'

// AIDEV-NOTE: Narrow V2 ports the People/Members and Personal Details pages depend on. Typed as a
// Pick of the real gateway so a simulated adapter cannot drift from the production signatures.
type V2GatewayShape = ReturnType<typeof createV2Gateway>
export type V2AdministrationPort = Pick<V2GatewayShape, 'listOrganizationGrants' | 'getOrganizationRoster' | 'replaceOrganizationGrant'>
export type V2PreferencesPort = Pick<V2GatewayShape, 'getUserDisplayPreference' | 'updateUserDisplayPreference'>

export interface FeatureGateways {
  readonly emailFinder?: EmailFinderGateway
  readonly outreach?: OutreachGateway
  /**
   * Connector (MCP) access grants for the Connections screen. Present only when the server advertises
   * support (or a simulated adapter in demo/dev). Absent in production today → honest unavailable state.
   * AIDEV-NOTE: contract-request — the `/v2/me/connector-grants` routes are proposed, not in contracts.
   */
  readonly connectorGrants?: ConnectorGrantsGateway

  /**
   * Bounce and suppression read port. No server endpoint exists yet, so the production entry leaves
   * this unset and the Bounces/Suppressions pages show an honest unavailable state; demo/fixture
   * entries bind the clearly simulated adapter. See data/deliveryReportsContract.ts (contract-request).
   */
  readonly deliveryReports?: DeliveryReportsGateway
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
  /**
   * Demo and dev-fixture entries only: lets the settings pages without a server endpoint (tags,
   * webhooks, API tokens, invitations, workspace name) run on the labelled browser-local adapter.
   * AIDEV-NOTE: The production entry never sets this, so those pages show an explicit unavailable
   * state instead of a local save that could be mistaken for server persistence.
   */
  readonly simulatedSettings?: true
  /**
   * Demo and dev-fixture entries only: the People/Members administration pages and the Personal
   * Details form read their V2 ports from here. Absent in production → the pages fall back to the
   * real createV2Gateway() HTTP port (and its honest error state when no server answers).
   * AIDEV-NOTE: These exist so the fixture capture renders those pages with simulated, contract-
   * shaped data instead of firing requests at routes that the preview server does not serve.
   */
  readonly administration?: V2AdministrationPort
  readonly preferences?: V2PreferencesPort
  /**
   * Desktop in-app agents bridge for the assistant panel (FC-MAC). Normally unset: the panel
   * detects the typed desktop capability itself; tests and fixture hosts inject a fake here.
   */
  readonly assistant?: AgentsBridge
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
