# Product and design context

## Confirmed direction
A Gmail-style workspace for outreach to explicitly opted-in recipients, built on **Resend for sending and receiving** with our own dashboard. Gmail and Google Workspace are not connected.

- Audience: approximately 800–900 opted-in CEO contacts.
- Nine sender identities in one unified inbox: `lachlan.macdonald`, `lachlan`, `l.macdonald` at each of `boltloop.co`, `flooda.co`, `elevateoco.com`.
- Outgoing campaign emails require an unsubscribe link.
- Current scope: frontend prototype only, with realistic mock data and simulated sending.

## Frontend prototype (built)

### Behaviour rules implemented in `src/domain`
- **Suppression**: a contact can receive campaign email only if consent is `opted_in` and subscription is `subscribed`. Unsubscribed, bounced, suppressed, and consent-unconfirmed contacts are excluded when a campaign is created and re-checked when a batch is dispatched. A campaign-linked message to such a contact, or to an address with no contact record, is blocked; an ordinary 1:1 message shows a warning instead. A reply inside a campaign conversation counts as ordinary mail.
- **Campaign times** are wall-clock times in the sending timezone from Settings, whatever timezone the browser is in.
- **Replies** default to the identity that received the conversation. Reply-all never copies our own nine addresses.
- **Banners** are per identity and opt-in. Changing the sender in the composer resets the banner to that identity's default, so one brand's banner is never carried onto another brand's mail.
- **"Delivered"** always means accepted by the recipient's server. The UI never presents it as read or opened; there is no open tracking.
- **Folders**: a thread is stored in one of inbox, sent, archive, spam, trash. Starred, Sent (any thread we wrote in), and Drafts are derived views.
- **Message bodies** use a small markdown subset (bold, italic, links, lists) rendered as React nodes. Raw HTML is never rendered.
- **Appearance**: accent text is adjusted to keep 4.5:1 contrast; sidebar/top-bar opacity over a custom background is limited to 70–100% for the same reason.

### State
- Navigation and filters live in the URL.
- Mock entities live in a Zustand store persisted to `localStorage` under a versioned key and validated with zod on load. Unreadable state falls back to seed data with a visible notice.
- Appearance preferences persist separately so resetting prototype data keeps the theme.

### Backend seam
`src/data/ports.ts` defines `MailroomGateway`. `src/data/mockGateway.ts` implements it in the browser. See the README for the Resend mapping.

## Backend direction (not started, standards not yet drafted)
A modular backend API and worker sharing domain logic, with durable storage. One authoritative owner for campaign scheduling. Requirements carried forward from initial planning:

- Record consent and enforce suppression at dispatch.
- Track identity, recipient, campaign step, and attempt for every send.
- Deduplicate webhook events and reconcile missed provider updates.
- Define reply-stopping conditions and unsubscribe cancellation boundaries.
- Treat provider timeouts as unknown outcomes; do not blindly retry non-idempotent sends.
- Distinguish provider acceptance from delivery; never infer reading.
- Protect credentials and enforce access control.
- Sanitise inbound HTML before it reaches the client.

## Open questions for the backend phase
1. Single user or a small team? Authentication method?
2. Consent evidence: what is stored per contact, and which jurisdictions apply?
3. Follow-up rules: how many steps, and what stops a sequence (reply, unsubscribe, bounce)?
4. Sending volume per identity per day, and warm-up expectations per domain.
5. Hosting and budget (fleet-02 / Coolify is the assumed build host).
6. Unsubscribe landing page: hosted by us on which domain?

## References
- https://resend.com/docs
- https://resend.com/legal/acceptable-use
- https://c4model.com/introduction

Provider capabilities and policies must be rechecked at integration time. Separate domains reduce risk but do not guarantee reputation isolation.
