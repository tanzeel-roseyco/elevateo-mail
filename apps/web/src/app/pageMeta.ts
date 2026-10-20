// Route orientation for the shell (2026-10-18 IA refresh, docs/design/ux-audit-20261018.md).
// Pure and React-free: maps a router pathname to the nav group it belongs to, a one-line purpose
// and, for nested screens, the parent to go back to. Shell renders it as the context strip above
// every page, so each screen says what it is for without every feature owner re-implementing it.
//
// AIDEV-NOTE: Pages keep their own <h1>; this module never names the page heading, only the group,
// purpose and back path. Mail detail pages (thread, draft, send review/status) already render
// their own back link, so their rules carry no `back` to avoid two competing links. Keep the patterns in sync with App.tsx routes and the feature registry.

export type NavGroup = 'Home' | 'Mail' | 'Outreach' | 'Contacts' | 'Settings'

export interface PageMeta {
  readonly group: NavGroup
  /** Short crumb after the group, for example "Drafts"; may include the mailbox name. */
  readonly crumb: string
  /** One sentence: what this screen is for. */
  readonly purpose: string
  /** Parent screen for nested routes; absent on top-level pages. */
  readonly back?: { readonly to: string; readonly label: string }
}

interface Rule {
  readonly pattern: RegExp
  readonly build: (match: RegExpMatchArray, mailboxName: (id: string) => string) => PageMeta
}

const SEG = '([^/]+)'

// Ordered: more specific paths first.
const RULES: readonly Rule[] = [
  { pattern: /^\/$/, build: () => ({ group: 'Mail', crumb: 'Inbox', purpose: 'Your individual inbox and marketing workspace, together.' }) },
  { pattern: /^\/overview$/, build: () => ({ group: 'Home', crumb: 'Today', purpose: 'What needs your attention today across every mailbox you can see.' }) },
  {
    pattern: new RegExp(`^/mailboxes/${SEG}/drafts/${SEG}/send-review$`),
    build: ([, m = ''], name) => ({
      group: 'Mail', crumb: `${name(m)} · Review send`,
      purpose: 'Check recipients, consent and limits before this draft is sent.',
    }),
  },
  {
    pattern: new RegExp(`^/mailboxes/${SEG}/drafts/${SEG}$`),
    build: ([, m = ''], name) => ({
      group: 'Mail', crumb: `${name(m)} · Draft`, purpose: 'Write and save a message; saving never sends it.',
    }),
  },
  {
    pattern: new RegExp(`^/mailboxes/${SEG}/drafts$`),
    build: ([, m = ''], name) => ({ group: 'Mail', crumb: `${name(m)} · Drafts`, purpose: 'Your unsent messages in this mailbox. Open one to edit or review it for sending.' }),
  },
  {
    pattern: new RegExp(`^/mailboxes/${SEG}/send-intents/${SEG}$`),
    build: ([, m = ''], name) => ({
      group: 'Mail', crumb: `${name(m)} · Send status`, purpose: 'Where this send is now: queued, sent, or needing attention.',
    }),
  },
  {
    pattern: new RegExp(`^/mailboxes/${SEG}/threads/${SEG}$`),
    build: ([, m = ''], name) => ({
      group: 'Mail', crumb: `${name(m)} · Conversation`, purpose: 'Read the conversation, assign it and leave notes for your team.',
    }),
  },
  {
    pattern: new RegExp(`^/mailboxes/${SEG}/members$`),
    build: ([, m = ''], name) => ({ group: 'Mail', crumb: `${name(m)} · Members`, purpose: 'Who can read, write and approve sends from this mailbox.' }),
  },
  {
    pattern: new RegExp(`^/mailboxes/${SEG}$`),
    build: ([, m = ''], name) => ({ group: 'Mail', crumb: `${name(m)} · Inbox`, purpose: 'Conversations in this mailbox, newest first. Filter to unread to see what still needs a reply.' }),
  },
  { pattern: /^\/search$/, build: () => ({ group: 'Mail', crumb: 'Search', purpose: 'Find conversations by words, sender or subject across your mailboxes.' }) },
  {
    pattern: /^\/outreach\/campaigns\/new$/,
    build: () => ({ group: 'Outreach', crumb: 'New campaign', purpose: 'Name a campaign. It starts as a draft and sends nothing until it is set up.', back: { to: '/outreach/campaigns', label: 'Back to campaigns' } }),
  },
  {
    pattern: new RegExp(`^/outreach/campaigns/${SEG}/.+$`),
    build: ([, c = '']) => ({ group: 'Outreach', crumb: 'Campaign', purpose: 'Leads, sending accounts, sequence and results for one campaign.', back: { to: `/outreach/campaigns/${c}`, label: 'Back to campaign' } }),
  },
  {
    pattern: /^\/outreach\/campaigns\/[^/]+$/,
    build: () => ({ group: 'Outreach', crumb: 'Campaign', purpose: 'Set up one campaign: its name, status and short follow-up sequence.', back: { to: '/outreach/campaigns', label: 'Back to campaigns' } }),
  },
  { pattern: /^\/outreach\/campaigns$/, build: () => ({ group: 'Outreach', crumb: 'Campaigns', purpose: 'Plan outreach campaigns and their short follow-up sequences.' }) },
  { pattern: /^\/outreach\/leads$/, build: () => ({ group: 'Outreach', crumb: 'Leads', purpose: 'People a campaign may contact, with their consent evidence.' }) },
  { pattern: /^\/outreach\/accounts$/, build: () => ({ group: 'Outreach', crumb: 'Sending accounts', purpose: 'Which connected mailboxes a campaign sends from. Each mailbox sends at most 30 emails a day.' }) },
  { pattern: /^\/outreach\/analytics$/, build: () => ({ group: 'Outreach', crumb: 'Analytics', purpose: 'Lead and consent counts per campaign.' }) },
  { pattern: /^\/people$/, build: () => ({ group: 'Contacts', crumb: 'People', purpose: 'Members of your organization and their roles.' }) },
  { pattern: /^\/settings\/personal$/, build: () => ({ group: 'Settings', crumb: 'Personal', purpose: 'Your own profile and preferences.' }) },
  { pattern: /^\/settings\/organization$/, build: () => ({ group: 'Settings', crumb: 'Organization', purpose: 'Organization-wide settings for administrators.' }) },
]

/** Orientation for a pathname, or null for an unknown route (the shell then shows no strip). */
export function describeRoute(pathname: string, mailboxName: (id: string) => string): PageMeta | null {
  for (const rule of RULES) {
    const match = pathname.match(rule.pattern)
    if (match) return rule.build(match, mailboxName)
  }
  return null
}
