import type { MailboxPage, Session, ThreadDetailPage, ThreadPage } from './contract'

/** Consistency headers from the session bootstrap; never an authorization grant. */
export interface ReadContext {
  contextId: string
  authorizationVersion: string
}

export type ThreadFilter = 'all' | 'unread'

export interface PageQuery {
  cursor?: string
  limit?: number
}

/** The only data boundary the UI may use. HTTP and fixture adapters share contract.ts validation. */
export interface MailroomGateway {
  getSession(signal?: AbortSignal): Promise<Session>
  listMailboxes(ctx: ReadContext, query: PageQuery, signal?: AbortSignal): Promise<MailboxPage>
  listThreads(ctx: ReadContext, mailboxId: string, query: PageQuery & { filter?: ThreadFilter }, signal?: AbortSignal): Promise<ThreadPage>
  getThread(ctx: ReadContext, threadId: string, mailboxId: string, query: PageQuery, signal?: AbortSignal): Promise<ThreadDetailPage>
}
