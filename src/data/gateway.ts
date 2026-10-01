import { mockGateway } from './mockGateway'
import type { MailroomGateway } from './ports'

// AIDEV-NOTE: The one line to change when a real backend exists (e.g. `createHttpGateway(config.apiUrl)`).
export const gateway: MailroomGateway = mockGateway
