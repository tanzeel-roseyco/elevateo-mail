# Open decisions needing approval — 5 October 2026

Raised by the frontend work on `design/fable-frontend`. Nothing below is implemented as a rule. Each section can be approved, changed or rejected on its own. Until a section is approved the frontend shows the provisional behaviour described and labels it as provisional; it blocks nothing.

## 1. Daily sending window

**Decision needed.** When does a mailbox's "day" of 30 sends start and end?

| Option | Effect | Cost |
|---|---|---|
| A. Fixed day in the mailbox owner's timezone (recommended) | Resets at 00:00 in the user's chosen timezone. Easy to explain: "30 a day". One counter row per mailbox per date. | A burst of 30 before midnight and 30 after is possible (60 in a few minutes). |
| B. Rolling 24 hours | No midnight burst. | Harder to explain ("when do I get sends back?"), needs a per-send timestamp scan or sliding counter. |
| C. Fixed UTC day | Simplest for the server. | Resets mid-working-day for Australian users. |

**Recommendation:** A, with the campaign scheduler additionally spacing sends so a midnight burst cannot happen in practice.
**Frontend today:** counts simulated sends since the browser's local midnight. Labelled provisional in Connections → Sending.

## 2. How To, CC and BCC count

**Decision needed.** Does one email to three addresses use one send or three?

| Option | Effect |
|---|---|
| A. One per recipient address (recommended) | An email to 1 To + 2 CC uses 3. Matches how Google counts its own limits and how complaints arise. Cannot be bypassed by stuffing BCC. |
| B. One per message | Simpler, but 30 messages with many BCC recipients would far exceed the intent of the limit. |

**Recommendation:** A.
**Frontend today:** the prototype records one `sent` event per recipient, so its figures already follow A. Labelled provisional.

## 3. Do Resend sends use the mailbox allowance?

**Decision needed.** The brief sets 30 per connected mailbox across manual, campaign and AI sends, and makes Resend an optional sender for opted-in recipients. It does not say whether a campaign sent through a Resend identity draws on a mailbox's 30.

**Recommendation:** every campaign send is attributed to one connected mailbox (the reply-to mailbox) and uses its allowance, whichever route carries it. This keeps the 300-per-user ceiling true regardless of route.
**Frontend today:** makes no claim either way; Connections → Sending only says the two routes use separate permissions and identities.

## 4. Reconnection and aliases

Not open in principle (the brief says they must not reset limits) but the matching rule needs confirming.

**Proposal:** usage is keyed by the canonical mailbox address: lower-cased, `+tag` removed. Google's dot-insensitivity for `gmail.com` addresses and Workspace domain aliases should be resolved by the backend from the Google account id, not guessed by the client.
**Frontend today:** folds case and `+tag` only (`canonicalAddress` in `src/domain/connections.ts`).

## 5. Frontend STANDARDS §3 amendment (carried over)

Still awaiting confirmation: private helper components used by only one page, and small primitives of one family in `ui/`, may share a file. The new work relies on it (`MailboxesSection.tsx` holds `ConnectForm` and `MailboxRow`; `ui/Async.tsx` holds the load and offline helpers).

## 6. Navigation label

The brief lists "Inbox"; the app previously said "Mail". The sidebar now says **Inbox**; routes stay `/mail/...` so saved links keep working. Contacts stays in the sidebar because recipient import lives there. Say if Contacts should move under Campaigns instead.

## 7. Backend standards

`.planning/BACKEND-STANDARDS.md` remains a draft and was not edited by the frontend work. The gateway methods added to `src/data/ports.ts` name the future endpoints they expect (`/connections`, `/mailboxes`, `/mailboxes/:id/history-import`, `/ai/access`, `/ai/drafts`). These are proposals for the backend owner, not an agreed contract.
