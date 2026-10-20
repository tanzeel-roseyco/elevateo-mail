// Help centre content: collections and articles written for Elevateo Mail (original copy, no
// third-party branding or prose). Articles are plain blocks rendered by HelpRoutes.tsx and
// flattened to Markdown for the "Copy for LLM" button; nothing here is HTML.
//
// AIDEV-NOTE: Keep every statement true for this build: simulated transport, server-saved drafts and
// notes, consent-gated marketing sends, per-device stars, simulated settings adapters.

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: readonly string[] }
  | { kind: 'steps'; items: readonly string[] }
  | { kind: 'code'; code: string; language?: string }
  | { kind: 'note'; text: string }

export interface Article {
  slug: string
  collection: string
  title: string
  summary: string
  blocks: readonly Block[]
}

export interface Collection {
  slug: string
  title: string
  description: string
}

export const COLLECTIONS: readonly Collection[] = [
  { slug: 'getting-started', title: 'Getting Started', description: 'Sign in, find your mailboxes and learn how the simulated workspace behaves.' },
  { slug: 'inbox', title: 'Inbox and Conversations', description: 'Folders, unread state, stars, keyboard shortcuts and the conversation view.' },
  { slug: 'drafts-and-sending', title: 'Drafts and Sending', description: 'Versioned drafts, attachments, the send review and what "simulated send" means.' },
  { slug: 'outreach', title: 'Outreach Campaigns', description: 'Campaigns, sequences, runs and the consent rules that gate marketing mail.' },
  { slug: 'members', title: 'Members and Permissions', description: 'Mailbox membership, organization grants and what each capability allows.' },
  { slug: 'search', title: 'Search', description: 'Literal search across the mailboxes you can read.' },
  { slug: 'settings', title: 'Workspace Settings', description: 'Workspace, profile, tags and the settings that are simulated in this build.' },
  { slug: 'webhooks', title: 'Webhooks', description: 'Event notifications for your workspace and how they will be delivered.' },
  { slug: 'developer', title: 'Developer API and MCP', description: 'The gateway API, tokens, the command-line connector and the MCP server.' },
  { slug: 'walkthroughs', title: 'Walkthroughs', description: 'End-to-end guides for common team routines.' },
]

export const ARTICLES: readonly Article[] = [
  {
    slug: 'signing-in',
    collection: 'getting-started',
    title: 'How do I sign in to Elevateo Mail?',
    summary: 'Email and password sign-in, recovery, and what happens when a session expires.',
    blocks: [
      { kind: 'p', text: 'Open the app and enter the email address and password your workspace administrator gave you. After a successful sign-in the app loads your organization and every mailbox you are a member of.' },
      { kind: 'p', text: 'If you forgot your password, choose "Forgot your password?" on the sign-in page. The recovery message reads the same for any address so nobody can learn which accounts exist.' },
      { kind: 'note', text: 'When a session expires the app tries one silent refresh. If that fails you are returned to the sign-in page and nothing from the old session stays on screen.' },
    ],
  },
  {
    slug: 'what-simulation-mode-means',
    collection: 'getting-started',
    title: 'What does "Simulation mode" mean?',
    summary: 'No mail leaves or enters the workspace; drafts, notes and assignments are still saved on the server.',
    blocks: [
      { kind: 'p', text: 'The amber banner at the top of the app appears whenever the server reports that mail transport is simulated. In this mode no message is sent to a real recipient and nothing is fetched from an external provider.' },
      { kind: 'list', items: ['Drafts, notes, assignments and read state are saved on the server as usual.', 'Approving a send records a simulated send intent that you can follow on the send status page.', 'Starred conversations are kept on this device only.'] },
      { kind: 'p', text: 'Simulation is switched off by an operator when live sending is activated for a workspace; the banner disappears at that point.' },
    ],
  },
  {
    slug: 'switching-workspaces',
    collection: 'getting-started',
    title: 'How do I switch between workspaces?',
    summary: 'Use the workspace selector at the top of the sidebar.',
    blocks: [
      { kind: 'p', text: 'The selector under the Elevateo logo lists every organization you belong to. Pick one to switch; the app reloads your mailboxes and permissions for that organization.' },
      { kind: 'p', text: 'Open drafts are kept per workspace. If a switch fails, the selector shows the server message and you stay in the current workspace.' },
    ],
  },
  {
    slug: 'inbox-layout',
    collection: 'inbox',
    title: 'How is the inbox organised?',
    summary: 'Folders on the left, conversations in the middle, one row per conversation.',
    blocks: [
      { kind: 'p', text: 'Each mailbox has a folder column with Inbox, Unread, Starred and (when you can compose) Drafts. The conversation list shows the sender, subject and a preview on one line; unread conversations are bold with a gold dot.' },
      { kind: 'p', text: 'On smaller screens the folder column becomes a folder selector above the list, and below tablet width the list fills the screen with a compose button in the corner.' },
      { kind: 'note', text: 'Archive, Snooze, Spam and Trash are shown but disabled: the server has no folders yet, so those actions are labelled "Not available yet".' },
    ],
  },
  {
    slug: 'keyboard-shortcuts',
    collection: 'inbox',
    title: 'Which keyboard shortcuts work in the inbox?',
    summary: 'Gmail-style single-key shortcuts for moving, opening, selecting and starring.',
    blocks: [
      { kind: 'list', items: ['j / k or the arrow keys move between conversations', 'o or Enter opens the focused conversation', 'x selects it, s stars it, Shift+U marks it unread', 'c starts a new draft, / jumps to search, u returns to the list'] },
      { kind: 'p', text: 'Shortcuts never fire while you are typing in a field, and never with a modifier key held.' },
    ],
  },
  {
    slug: 'read-and-unread',
    collection: 'inbox',
    title: 'How do read and unread states work?',
    summary: 'Read state is saved on the server and shared with everyone in the mailbox.',
    blocks: [
      { kind: 'p', text: 'Opening a conversation does not change its state automatically. Use the read-state control in the conversation header or the hover action on a row; the server confirms each change and the row updates when it does.' },
      { kind: 'p', text: 'Select several rows and use "Mark as read" or "Mark as unread" in the toolbar to update them one by one. If a change fails the list tells you which conversation was not updated.' },
    ],
  },
  {
    slug: 'starring',
    collection: 'inbox',
    title: 'Why are stars "on this device only"?',
    summary: 'The server has no star field, so stars live in your browser.',
    blocks: [
      { kind: 'p', text: 'Stars are a personal bookmark kept in this browser for the current mailbox and workspace. Another device, another browser or another team member will not see them.' },
      { kind: 'p', text: 'The Starred folder filters the conversations already loaded in the list. Clearing site data removes your stars.' },
    ],
  },
  {
    slug: 'assignments-and-notes',
    collection: 'inbox',
    title: 'How do assignments and notes work?',
    summary: 'Assign a conversation to a member and leave internal notes below it.',
    blocks: [
      { kind: 'p', text: 'Under every conversation you can assign it to a mailbox member and add notes that only your team sees. Both are saved on the server with a version number, so two people editing at once are told about the conflict instead of overwriting each other.' },
      { kind: 'note', text: 'Notes are plain text. The app never renders HTML from messages or notes.' },
    ],
  },
  {
    slug: 'creating-a-draft',
    collection: 'drafts-and-sending',
    title: 'How do I write and save a draft?',
    summary: 'Compose opens a window over the drafts list; every save creates a new version.',
    blocks: [
      { kind: 'steps', items: ['Press c or choose Compose in the folder column.', 'Fill in recipients, subject and the message. Recipients are one address per line.', 'Choose Save draft. Each save stores a new version on the server; unsaved text is kept in this tab until you save or discard it.'] },
      { kind: 'p', text: 'If someone else saved the same draft in the meantime you can keep your text and continue from the server version, or discard your text and load the server copy.' },
    ],
  },
  {
    slug: 'attachments',
    collection: 'drafts-and-sending',
    title: 'Can I attach files to a draft?',
    summary: 'Attachments are scanned before they can be sent.',
    blocks: [
      { kind: 'p', text: 'When the attachment service is connected you can add files to a saved draft. Each file shows a scan status; a draft with a file that has not passed the scan cannot be approved for sending.' },
      { kind: 'p', text: 'Attachment uploads are disabled when the service is not connected, and the editor says so instead of failing silently.' },
    ],
  },
  {
    slug: 'review-and-approve',
    collection: 'drafts-and-sending',
    title: 'What happens on the "Review send" page?',
    summary: 'You approve the exact saved content; the server queues the send.',
    blocks: [
      { kind: 'p', text: 'Review send shows the exact draft version that would be queued: sender, every recipient, subject, body and attachments. Confirm the checkbox and approve. In simulation mode the result is a simulated send intent; with live transport it is a real send.' },
      { kind: 'p', text: 'If the server refuses the approval because consent evidence is missing, nothing is queued and the page links to the leads page where consent is recorded.' },
      { kind: 'note', text: 'If the approval result is uncertain (for example the network dropped), the page offers to retry the original approval rather than creating a second send.' },
    ],
  },
  {
    slug: 'send-status',
    collection: 'drafts-and-sending',
    title: 'How do I follow a send after approval?',
    summary: 'The send status page shows each state the server reports.',
    blocks: [
      { kind: 'p', text: 'After approval you land on the send status page. It polls the server and shows queued, in progress, completed or failed, plus the cancel action while cancellation is still possible.' },
    ],
  },
  {
    slug: 'campaigns-overview',
    collection: 'outreach',
    title: 'What is a campaign?',
    summary: 'A campaign groups a sequence, its leads and the sending accounts it uses.',
    blocks: [
      { kind: 'p', text: 'Campaigns live under Outreach. Each has a sequence of steps, an audience of leads and one or more sending accounts. A campaign starts as a draft and runs only when you create a run.' },
      { kind: 'list', items: ['Sequence: the ordered messages and waits.', 'Leads: the people in the audience with their consent evidence.', 'Accounts: the mailboxes that send on behalf of the campaign.', 'Analytics: counts the server reports for each run.'] },
    ],
  },
  {
    slug: 'consent-evidence',
    collection: 'outreach',
    title: 'Why does a marketing send need consent evidence?',
    summary: 'Marketing mail is gated on recorded opt-in for every recipient.',
    blocks: [
      { kind: 'p', text: 'Before a marketing message can be queued, every recipient needs recorded opt-in evidence: where and when the person agreed, and what they agreed to. The server enforces this; the review page explains which recipients are missing evidence.' },
      { kind: 'p', text: 'Individual correspondence from your own mailbox is not subject to this gate, but it is still simulated until live transport is activated.' },
    ],
  },
  {
    slug: 'campaign-runs',
    collection: 'outreach',
    title: 'How do campaign runs work?',
    summary: 'A run is one execution of the sequence over the current audience.',
    blocks: [
      { kind: 'p', text: 'Create a run from the campaign page. The run composer checks the sequence, the audience and the accounts, then records a run that you can refresh from the Campaign runs page. Runs are simulated in simulation mode.' },
    ],
  },
  {
    slug: 'mailbox-members',
    collection: 'members',
    title: 'How do I add someone to a mailbox?',
    summary: 'Explicit members are managed per mailbox by anyone with the manage-members capability.',
    blocks: [
      { kind: 'steps', items: ['Open Settings › Workspace › Manage Members and choose the mailbox.', 'Enter the member\'s user id and tick the capabilities they need.', 'Choose Save member. The roster has a revision number so concurrent edits are detected.'] },
      { kind: 'p', text: 'Removing a member revokes their explicit row. Shared mailboxes may still be readable through organization-level access.' },
    ],
  },
  {
    slug: 'capabilities',
    collection: 'members',
    title: 'What does each capability allow?',
    summary: 'Read, compose, approve send and manage members.',
    blocks: [
      { kind: 'list', items: ['Read: list and open conversations and notes.', 'Compose: create and edit drafts.', 'Approve send: approve the review page and queue a send.', 'Manage members: change the mailbox roster.'] },
      { kind: 'note', text: 'Organization administration never grants mailbox content access on its own.' },
    ],
  },
  {
    slug: 'organization-grants',
    collection: 'members',
    title: 'What are organization grants?',
    summary: 'Roles at the organization level, separate from mailbox membership.',
    blocks: [
      { kind: 'p', text: 'Grants give a user an organization role such as member or administrator. Administrators can change other grants within the limits the server allows. Grants are shown with their revision so a stale change is refused rather than applied.' },
    ],
  },
  {
    slug: 'how-search-works',
    collection: 'search',
    title: 'How does search match conversations?',
    summary: 'Literal, case-insensitive text matching across readable mailboxes.',
    blocks: [
      { kind: 'p', text: 'Search looks for the exact text you type, ignoring case, in the mailboxes you can read. There are no operators or wildcards; punctuation is matched literally. Drafts and notes are not searched.' },
      { kind: 'p', text: 'Choose a scope to search one mailbox only. Results are conversation rows that open in the usual conversation view.' },
    ],
  },
  {
    slug: 'simulated-settings',
    collection: 'settings',
    title: 'Which settings are simulated?',
    summary: 'Workspace name, invitations, tags, API tokens and webhooks are kept in your browser.',
    blocks: [
      { kind: 'p', text: 'Settings pages that carry the "Simulated UI adapter" notice have no server endpoint in this build. What you enter there is stored in this browser for the current workspace and never reaches other members.' },
      { kind: 'list', items: ['Real: Personal Details (display name), mailbox members, organization grants.', 'Simulated: workspace name, invitations, workspace creation, tags, API tokens, webhooks.', 'Local check only: password change.'] },
    ],
  },
  {
    slug: 'tags',
    collection: 'settings',
    title: 'How do I create tags?',
    summary: 'Name a tag and pick one of twenty colours.',
    blocks: [
      { kind: 'steps', items: ['Open Settings › Tags and choose Add New Tag.', 'Enter a name and pick a colour swatch.', 'Choose Create Tag. The tag appears in the list with a preview chip.'] },
    ],
  },
  {
    slug: 'workspace-notifications',
    collection: 'webhooks',
    title: 'How will webhooks deliver workspace events?',
    summary: 'A JSON envelope per event, posted to the HTTPS endpoints you register.',
    blocks: [
      { kind: 'p', text: 'Each registered endpoint receives a POST with a JSON body describing the event: the event name, the workspace, the object id and a timestamp. Endpoints must use HTTPS.' },
      { kind: 'code', language: 'json', code: '{\n  "event": "conversation.received",\n  "organization_id": "…",\n  "mailbox_id": "…",\n  "thread_id": "…",\n  "occurred_at": "2026-10-20T09:00:00Z"\n}' },
      { kind: 'note', text: 'Delivery is not part of this build; registrations are simulated adapters until the dispatcher ships.' },
    ],
  },
  {
    slug: 'developer-api-overview',
    collection: 'developer',
    title: 'How is the Elevateo API organised?',
    summary: 'Versioned JSON endpoints behind the session gateway, with explicit error codes.',
    blocks: [
      { kind: 'p', text: 'The app talks to a versioned gateway. Every response carries the context id and authorization version of the session it was produced for; a changed context is signalled with a 409 so clients reload instead of acting on stale permissions.' },
      { kind: 'list', items: ['Mailboxes, threads and messages: read endpoints with cursor pagination.', 'Drafts: versioned save and fetch, plus draft operations for idempotent writes.', 'Send review and approval: digest-checked approval of a saved draft version.', 'Members, assignment and notes: revision-checked writes.'] },
      { kind: 'p', text: 'Errors use a stable code (for example not_available, cursor_invalid, stale_version) together with a request id you can quote to support.' },
    ],
  },
  {
    slug: 'api-tokens',
    collection: 'developer',
    title: 'How do API tokens work?',
    summary: 'Workspace-scoped api-user tokens for integrations; super-admin for cross-workspace tooling.',
    blocks: [
      { kind: 'p', text: 'An api-user token is scoped to one workspace and is the right choice for almost every integration, including no-code platforms. A super-admin token spans every workspace you administer and should be reserved for internal tooling.' },
      { kind: 'note', text: 'Tokens generated in this build are shown once and kept only by prefix; the gateway does not accept them until token authentication ships.' },
    ],
  },
  {
    slug: 'mcp-server',
    collection: 'developer',
    title: 'How can I connect an assistant through the MCP server?',
    summary: 'Read-only mailbox tools for Model Context Protocol clients.',
    blocks: [
      { kind: 'p', text: 'The planned MCP server exposes list, read and search tools over your mailboxes to an MCP-capable assistant, running under your own permissions. Writes stay in the app.' },
      { kind: 'p', text: 'Installation and configuration steps are on Settings › Integrations › Elevateo MCP Server.' },
    ],
  },
  {
    slug: 'cli-connector',
    collection: 'developer',
    title: 'How do I use the command-line connector?',
    summary: 'Scripts for listing conversations and saving drafts from a terminal.',
    blocks: [
      { kind: 'p', text: 'The CLI wraps the same gateway endpoints as the app and prints JSON by default. Sign in with a token, then list, read, search and save drafts from scripts.' },
      { kind: 'code', language: 'bash', code: 'elevateo threads list --mailbox <mailbox-id> --filter unread' },
      { kind: 'p', text: 'Installation steps are on Settings › Integrations › Elevateo CLI.' },
    ],
  },
  {
    slug: 'daily-inbox-routine',
    collection: 'walkthroughs',
    title: 'Walkthrough: a shared inbox routine',
    summary: 'Triage unread mail, assign conversations and reply as drafts in ten minutes.',
    blocks: [
      { kind: 'steps', items: ['Open the Unread folder and move through it with j and k.', 'Star what needs your follow-up and assign the rest to teammates.', 'Open each conversation you own and choose "Reply as draft".', 'Save drafts as you go; review and approve the ones that are ready.', 'Mark handled conversations as read so the unread count reflects reality.'] },
    ],
  },
  {
    slug: 'launching-a-campaign',
    collection: 'walkthroughs',
    title: 'Walkthrough: launching a campaign',
    summary: 'From a draft campaign to a simulated run with recorded consent.',
    blocks: [
      { kind: 'steps', items: ['Create a draft campaign and write its sequence.', 'Add leads and record consent evidence for each one.', 'Connect at least one sending account.', 'Create a run from the campaign page and follow it on Campaign runs.'] },
      { kind: 'note', text: 'In simulation mode the run is recorded but no mail leaves the workspace.' },
    ],
  },
]

export function findCollection(slug: string): Collection | undefined {
  return COLLECTIONS.find((collection) => collection.slug === slug)
}

export function findArticle(slug: string): Article | undefined {
  return ARTICLES.find((article) => article.slug === slug)
}

export function articlesIn(collectionSlug: string): readonly Article[] {
  return ARTICLES.filter((article) => article.collection === collectionSlug)
}

/** Case-insensitive match over title, summary and body text; empty query returns nothing. */
export function searchArticles(query: string): readonly Article[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return []
  return ARTICLES.filter((article) => `${article.title}\n${article.summary}\n${articleToMarkdown(article)}`.toLowerCase().includes(needle))
}

/** Markdown rendering for the "Copy for LLM" button. */
export function articleToMarkdown(article: Article): string {
  const lines: string[] = [`# ${article.title}`, '', article.summary, '']
  for (const block of article.blocks) {
    switch (block.kind) {
      case 'p':
        lines.push(block.text, '')
        break
      case 'note':
        lines.push(`> ${block.text}`, '')
        break
      case 'list':
        lines.push(...block.items.map((item) => `- ${item}`), '')
        break
      case 'steps':
        lines.push(...block.items.map((item, index) => `${index + 1}. ${item}`), '')
        break
      case 'code':
        lines.push('```' + (block.language ?? ''), block.code, '```', '')
        break
    }
  }
  return lines.join('\n').trimEnd() + '\n'
}
