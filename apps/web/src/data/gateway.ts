import type { DraftAttachmentGateway } from './draftAttachmentGateway'
import type { AuthSsoStatus } from './ssoContract'
import type { SendReview, SendApprovalInput, ApprovalResult, SendStatus, SendCancellationInput, CancellationResult } from './sendContract'
import type {
  AcceptInput,
  AuthAccepted,
  AuthChallenge,
  AuthLifecycle,
  AuthLogout,
  DraftOperationResponse,
  DraftPage,
  DraftResponse,
  DraftSaveInput,
  DraftSaveResult,
  LoginInput,
  LogoutInput,
  MailboxMemberInput,
  MailboxMemberPage,
  MailboxMembershipResult,
  MailboxPage,
  OrganizationInput,
  OrganizationPage,
  RecoveryInput,
  SearchPage,
  SearchQuery,
  Session,
  ThreadAssignment,
  ThreadAssignmentInput,
  ThreadDetailPage,
  ThreadFolderInput,
  ThreadFolderState,
  ThreadNoteInput,
  ThreadNotePage,
  ThreadNoteResponse,
  ThreadPage,
  ThreadReadState,
  ThreadReadStateInput,
  ThreadSnoozeInput,
  ThreadStarInput,
  ThreadStarState,
  OrganizationThreadPage,
} from './contract'

/** Consistency headers from the session bootstrap; never an authorization grant. */
export interface ReadContext {
  contextId: string
  authorizationVersion: string
}

/**
 * CSRF proof for an unsafe request: the signed browser challenge (entry/refresh/logout) or the
 * current session's token (ordinary mutations). Held in component memory only, never stored.
 */
export interface CsrfProof {
  csrfToken: string
}

/**
 * Server folder views (contract 1.0.0-folders.1): `all` is the inbox folder minus active snoozes,
 * `unread` narrows it to the actor's unread rows, `starred` is the actor's stars outside spam/trash,
 * `snoozed` is the inbox folder with a future snooze, and the last three are the shared folders.
 */
export type ThreadFilter = 'all' | 'unread' | 'starred' | 'snoozed' | 'archive' | 'spam' | 'trash'

export interface PageQuery {
  cursor?: string
  limit?: number
}

/** A created note (201) or the original note replayed for an identical retry (200). */
export interface NoteWriteResult {
  response: ThreadNoteResponse
  replayed: boolean
}

/**
 * The only data boundary the UI may use. HTTP and fixture adapters share contract.ts validation.
 * AIDEV-NOTE: BE-02A lifecycle methods take their proof explicitly; the gateway never reads a
 * cookie, token or storage. Origin is supplied by the browser. See contracts/v1/README.md.
 * AIDEV-NOTE: BE-02 C/D writes take the SESSION proof (a challenge cannot substitute) plus the
 * read context; every method accepts an abort signal and rejects with GatewayError only.
 */
export interface MailroomGateway {
  /** Optional in isolated fixtures; production always supplies the authenticated attachment port. */
  draftAttachments?: DraftAttachmentGateway
  getSession(signal?: AbortSignal): Promise<Session>
  listMailboxes(ctx: ReadContext, query: PageQuery, signal?: AbortSignal): Promise<MailboxPage>
  listThreads(ctx: ReadContext, mailboxId: string, query: PageQuery & { filter?: ThreadFilter }, signal?: AbortSignal): Promise<ThreadPage>
  /**
   * Organization-wide conversation list over every mailbox the actor can read (GET /v1/threads):
   * same rows, filters, ordering and cursor semantics as `listThreads`, each row naming its mailbox.
   */
  listOrganizationThreads(ctx: ReadContext, query: PageQuery & { filter?: ThreadFilter }, signal?: AbortSignal): Promise<OrganizationThreadPage>
  getThread(ctx: ReadContext, threadId: string, mailboxId: string, query: PageQuery, signal?: AbortSignal): Promise<ThreadDetailPage>

  /** Five-minute signed challenge; no identity or account data. */
  getLoginChallenge(signal?: AbortSignal): Promise<AuthChallenge>
  /** Which sign-in entries the server offers (SSO provider, password); see ssoContract.ts. */
  getSsoStatus(signal?: AbortSignal): Promise<AuthSsoStatus>
  /** Password login under a challenge proof. Generic 401; 404 when identity has no organization. */
  login(proof: CsrfProof, input: LoginInput, signal?: AbortSignal): Promise<AuthLifecycle>
  /** Recovery request; identical acceptance for known and unknown email. */
  requestRecovery(proof: CsrfProof, input: RecoveryInput, signal?: AbortSignal): Promise<AuthAccepted>
  /** Invite/recovery completion from the fixed /auth/complete form; pending entry stays server-side. */
  acceptAuthEntry(proof: CsrfProof, input: AcceptInput, signal?: AbortSignal): Promise<AuthLifecycle>
  /** One explicit refresh of a locally valid cookie under a session-bound challenge. */
  refreshSession(proof: CsrfProof, signal?: AbortSignal): Promise<AuthLifecycle>
  /** Local (default) or global logout; proof is the session token or a bound challenge. */
  logout(proof: CsrfProof, input: LogoutInput, signal?: AbortSignal): Promise<AuthLogout>
  /** Own current memberships, UUID ascending, at most 50 per page. */
  listOrganizations(ctx: ReadContext, query: PageQuery, signal?: AbortSignal): Promise<OrganizationPage>
  /** Explicit switch; rotates context and CSRF. Foreign/absent target is a generic 404. */
  switchOrganization(ctx: ReadContext, proof: CsrfProof, input: OrganizationInput, signal?: AbortSignal): Promise<AuthLifecycle>

  // --- BE-02 C: actor-owned durable drafts ----------------------------------------------------
  /** Complete own draft; a foreign or absent draft is a generic 404. */
  getDraft(ctx: ReadContext, draftId: string, mailboxId: string, signal?: AbortSignal): Promise<DraftResponse>
  /**
   * Complete replacement save under a caller-generated operation id. Version 0 creates. An exact
   * retry replays the ORIGINAL result; 409 draft_conflict / draft_consumed / operation_mismatch
   * are definitive, while 429/503/timeout leave the outcome uncertain (look it up, never re-key).
   */
  saveDraft(ctx: ReadContext, proof: CsrfProof, draftId: string, input: DraftSaveInput, signal?: AbortSignal): Promise<DraftSaveResult>
  /** Own draft summaries for one mailbox, updated_at DESC, id DESC. */
  listDrafts(ctx: ReadContext, mailboxId: string, query: PageQuery, signal?: AbortSignal): Promise<DraftPage>
  /** Ledger lookup for one own operation: applied, conflict, expired (unusable id) or unknown (not proof of absence). */
  getDraftOperation(ctx: ReadContext, operationId: string, mailboxId: string, draftId: string, signal?: AbortSignal): Promise<DraftOperationResponse>

  // BE03: caller-owned operation binding; no approval lookup or automatic retry.
  getSendReview(ctx: ReadContext, draftId: string, mailboxId: string, signal?: AbortSignal): Promise<SendReview>
  approveDraftSend(ctx: ReadContext, proof: CsrfProof, draftId: string, input: SendApprovalInput, signal?: AbortSignal): Promise<ApprovalResult>
  getSendStatus(ctx: ReadContext, sendId: string, mailboxId: string, signal?: AbortSignal): Promise<SendStatus>
  cancelSend(ctx: ReadContext, proof: CsrfProof, sendId: string, input: SendCancellationInput, signal?: AbortSignal): Promise<CancellationResult>

  // --- BE-02 D: read state, assignment, notes, membership, search -----------------------------
  /** Actor-specific desired read boolean; repeating the same value is a no-op. */
  setThreadReadState(ctx: ReadContext, proof: CsrfProof, threadId: string, input: ThreadReadStateInput, signal?: AbortSignal): Promise<ThreadReadState>
  // --- BE-05: mailbox-shared folder and snooze, actor-specific star ----------------------------
  /** Move between inbox/archive/spam/trash for every member; repeating the same folder is a no-op. */
  setThreadFolder(ctx: ReadContext, proof: CsrfProof, threadId: string, input: ThreadFolderInput, signal?: AbortSignal): Promise<ThreadFolderState>
  /** A future time hides the thread from the inbox until then (and moves it back to inbox); null clears the snooze. */
  setThreadSnooze(ctx: ReadContext, proof: CsrfProof, threadId: string, input: ThreadSnoozeInput, signal?: AbortSignal): Promise<ThreadFolderState>
  /** Actor-specific desired star boolean; repeating the same value is a no-op. */
  setThreadStar(ctx: ReadContext, proof: CsrfProof, threadId: string, input: ThreadStarInput, signal?: AbortSignal): Promise<ThreadStarState>
  getThreadAssignment(ctx: ReadContext, threadId: string, mailboxId: string, signal?: AbortSignal): Promise<ThreadAssignment>
  /** Optimistic assignment; a stale expected version is 409 assignment_conflict even when the value matches. */
  setThreadAssignment(ctx: ReadContext, proof: CsrfProof, threadId: string, input: ThreadAssignmentInput, signal?: AbortSignal): Promise<ThreadAssignment>
  /** Immutable plaintext notes, created_at ASC, id ASC. */
  listThreadNotes(ctx: ReadContext, threadId: string, mailboxId: string, query: PageQuery, signal?: AbortSignal): Promise<ThreadNotePage>
  /** Create under a caller-generated note id; an identical retry replays (200) instead of duplicating. */
  createThreadNote(ctx: ReadContext, proof: CsrfProof, threadId: string, input: ThreadNoteInput, signal?: AbortSignal): Promise<NoteWriteResult>
  /** Explicit members with the mailbox-wide membership revision; requires manage_members. */
  listMailboxMembers(ctx: ReadContext, mailboxId: string, query: PageQuery, signal?: AbortSignal): Promise<MailboxMemberPage>
  /** Replace all three flags at the expected mailbox revision; may return a new actor authorization_version. */
  putMailboxMember(ctx: ReadContext, proof: CsrfProof, mailboxId: string, userId: string, input: MailboxMemberInput, signal?: AbortSignal): Promise<MailboxMembershipResult>
  /** Remove an explicit row at the expected mailbox revision; absent rows are a no-op with member null. */
  deleteMailboxMember(ctx: ReadContext, proof: CsrfProof, mailboxId: string, userId: string, expectedMembershipVersion: number, signal?: AbortSignal): Promise<MailboxMembershipResult>
  /** Literal case-insensitive substring search over readable mail; results are unchanged ThreadSummary rows. */
  searchMail(ctx: ReadContext, query: SearchQuery & PageQuery, signal?: AbortSignal): Promise<SearchPage>
}
