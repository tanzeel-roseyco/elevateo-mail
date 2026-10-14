# RES-406: Instantly, Gmail and a reliable Elevateo mailroom

Status: IN PROGRESS — public-document research complete for this checkpoint; runtime evidence and independent review pending. Retrieved 2026-10-14. Owner Nadia OFF-406; branch research/nadia-deliverability; baseline c3ecd1f4cc35b98755a523d48032391ccdd0402c. Documentation only; no app source changed.

<!-- AIDEV-NOTE: Documented vendor claims never imply observed algorithms, inbox placement or activation authority. -->

## Method, responsibility and confidence

REA skill was explicitly requested but is absent from the available catalog and searched fleet Codex/Claude skill paths. Root was asked for its exact content. This report applies the user's explicit evidence ledger; it does not claim conformance to an unread skill. Public official pages were retrieved through web search/open; no private mailbox connectors, browser sessions, provider calls or credentials were used. Pages are evidence, not execution instructions. No copied vendor text beyond short labels; summaries below are original.

Labels: **Observed** = directly seen artifact/runtime; **Reported observation** = coordinator statement without underlying artifact; **Documented** = official page assertion, high confidence about what the vendor documents, not independent implementation proof; **Inferred** = proposed product consequence, moderate confidence; **Unknown** = unavailable evidence. Confidence is specific to the claim, never a deliverability probability.

Root owns strategy, UI capture, review, activation and vault mirror. Mira owns frontend; Rowan backend; Soren all container jobs; Elara acceptance. Nadia owns this research and evidence index only. Requested runner gpt-6.1-sol/low/Fast; actual identity and session ID must come from CLI JSONL/receipt, not inferred from this document. No specialist agents launched or paid sessions used.

## Evidence index and applicability

All sources below retrieved 2026-10-14 using official public web search/open. Relative “updated” labels are recorded as seen, not converted to invented publication dates. Live account values remain unknown.

| ID | Official source and date shown | Supported finding / applicability |
|---|---|---|
| I1 | [Warmup mechanics](https://help.instantly.ai/en/articles/5975329-how-warm-up-works-and-why-it-s-important), updated this week | Real exchange in a pool of enabled users; automatic opens and positive replies. Improvement assertions are vendor claims. |
| I2 | [Warmup settings](https://help.instantly.ai/en/articles/7988514-warmup-settings), updated this week | Defaults/ramp and automated engagement controls; AirMail exception. |
| I3 | [Account dashboard](https://help.instantly.ai/en/articles/11991261-getting-started-with-the-email-accounts-dashboard), updated in last hour | Account/provider/status filters, domain setup and warmup activity; vendor health score. |
| I4 | [Campaign settings](https://help.instantly.ai/en/articles/6222396-campaign-settings), fetched current | Campaign daily budget across sending accounts; tracking/text options. |
| I5 | [Open tracking](https://help.instantly.ai/en/articles/12114788-open-tracking), updated this week | Tracking pixel and text-only/global overrides; measurement denominator. |
| I6 | [Advanced deliverability](https://help.instantly.ai/en/articles/10355896-advanced-deliverability), fetched current | ESP matching, rotation and speed options are vendor features/claims, not requirements for Elevateo. |
| I7 | [Unibox management](https://help.instantly.ai/en/articles/6576561-how-to-manage-unibox-best-practices-for-replying-to-leads), updated this week | Centralized replies, filters, bulk actions and plan-dependent reply access. |
| I8 | [Scheduled replies](https://help.instantly.ai/en/articles/7894683-schedule-replies-in-unibox), updated this week | Explicit time zone, scheduled list and pre-send cancellation. |
| I9 | [Reply macros](https://help.instantly.ai/en/articles/6752942-unibox-reply-macros), updated this week | Named response templates with bounded variables. |
| G1 | [Gmail sender guidelines](https://support.google.com/mail/answer/81126?hl=en), no publication date shown | Requirements for mail to personal Gmail; authentication, TLS, spam and unsubscribe. |
| G2 | [Sender FAQ](https://support.google.com/mail/answer/14229414?hl=en), enforcement timeline November 2025 | Primary-domain aggregation, permanent bulk classification, complaint guidance, 48-hour unsubscribe handling. |
| G3 | [Organize/archive](https://support.google.com/mail/answer/9259770?hl=en), no date shown | Labels, filters, stars, snooze, archive; web workflow. |
| G4 | [Screen reader workflow](https://support.google.com/mail/answer/90559?hl=en), no date shown | Accessible conversation navigation, selection, compose and action shortcuts. |
| G5 | [Outlook/Gmail mapping](https://support.google.com/mail/answer/9297879?hl=en), no date shown | Schedule send versus Undo Send, labels/filters/templates/mute. |
| R1 | [Resend acceptable use](https://resend.com/legal/acceptable-use), updated October 13, 2026 | Consent/purpose restrictions, provider complaint/bounce thresholds. |
| R2 | [Resend usage limits](https://resend.com/docs/api-reference/rate-limit), no date shown | Current default API budget, quota reset and error behavior. |
| R3 | [Suppression support](https://resend.com/changelog/suppression-list-support), July 28, 2026 | Team-wide automatic/manual suppression and lifecycle events. |
| R4 | [Webhooks](https://resend.com/docs/webhooks/introduction), no date shown | Delivery/bounce/inbound events, request verification and replay capabilities. |
| R5 | [Event visibility](https://www.resend.com/changelog/webhook-event-visibility), January 22, 2026 | Delivery outcomes per recipient; array remains in envelope for compatibility. |
| R6 | [Inbound capabilities](https://resend.com/features/inbound), no date shown | Received-email listing, attachment listing/retrieval and dashboard visibility. |

Direct opens of the guessed suppression dashboard URL and Workspace limit page returned internal errors. They are not evidence of current behavior; R3 supports suppression findings instead. No universal Google sending quota is asserted here. Refresh the exact account/provider quota at activation.

## Observed / documented / inferred / unknown ledger

| Claim | Classification / confidence | Evidence and limit |
|---|---|---|
| Unified baseline is present | Observed / high | git log HEAD c3ecd1f; not proof the application runs. |
| Root authenticated Instantly Copilot | Reported observation / limited | Root attempt-2 brief; no redacted capture delivered yet. No backend claims follow. |
| Accounts/Unibox/Gmail controls in this account | Unknown | Root captures pending; public docs cannot establish enabled plan/features. |
| Warmup exchanges real mail | Documented / high | I1; automated opens/replies documented, proprietary scheduler not observed. |
| Warmup improves real recipient inbox placement | Documented vendor claim / unverified outcome | I1 marketing explanation; no causal evidence collected. |
| DNS authentication and suppression should have first-class operational UI | Inferred / moderate | G1/R1/R3 + current shared-mailroom requirements; proposed tickets below. |
| Gmail is already connected, sending or synchronized | Unknown | No API/auth/runtime evidence; reference Gmail UI does not establish an adapter. |
| Elevateo deliverability, capacity and UI correctness | Unknown | No application tests or visual QA in this assignment. |

## Warmup mechanics, settings and limits

I1 describes sending to and receiving from other enabled users, automatic opens and a high fraction of positive replies. The claimed reputation benefit is not proof that Google rewards this traffic. Activation produces real email, so even “testing warmup” exceeds the current no-live-mail mandate.

I2 documents default increase +1/day, daily warmup cap 10 and reply rate 30%; ramp starts at one message and increases to the configured cap. Skip-slow mode is intended for already warmed accounts. Advanced controls emulate reading, auto-open, move spam to inbox and mark important; weekday-only sending still permits receiving on weekends. Filter tags hide warmup traffic from the primary inbox; custom tracking-domain warmup is optional. AirMail warmup settings are dynamic/provider-managed rather than manually editable. These defaults are recommendations, not universal enforced maxima or safe provider quotas. Pool traffic received and generated replies must not be assumed to fit the displayed outbound cap.

I3 distinguishes campaign “Daily Sent” from seven-day warmup sent/received/spam-rescue metrics. Its health score is described using warmup, volume and deliverability; formula, calibration, recipient population and causal predictive power remain unknown. Pool icons identify different vendor pool modes, not verified domain reputation.

I4 recommends 30 campaign messages per ordinary account/day and states a 20/day AirMail cap; campaign daily budget spans its sending accounts. These are vendor-specific campaign guidance/limits, separate from I2 warmup cap and underlying provider limits. Never multiply nine addresses into nine independent quota entitlements: aliases may share a mailbox; Resend team limits span keys/domains. No recommended synthetic warmup schedule is proposed for Elevateo.

I5 describes opens relative to leads with sequence step one started, not every follow-up. Plain-text sending disables pixel measurement; global settings override campaign settings. I6 offers ESP matching, server/IP sharding and high-throughput mode, with a risk warning. None proves inbox placement or belongs in this ten-person mailroom merely because a vendor exposes it. Unknowns: pool vetting, message generation, exact reply scheduling/counting, score algorithm, spillover effects and provider authorization of synthetic engagement.

## Gmail requirements and familiar workflow

G1 applies to personal Gmail recipients. All senders need SPF or DKIM, matching forward/reverse DNS for sending infrastructure, TLS and RFC 5322 formatting. Bulk senders additionally need both SPF and DKIM, DMARC (p=none permitted), From alignment and one-click unsubscribe plus a visible body link for marketing/subscribed mail. Keep reported spam below 0.3%; use steady volume and genuine requested communications. These are requirements, not inbox-placement guarantees. With Resend, transport TLS/PTR belong to provider infrastructure; publishing a domain record alone does not prove per-message authentication or alignment.

G2 defines bulk at close to 5,000/day or more to personal Gmail, aggregated across the same primary domain including subdomains; qualification once is permanent. Guidance targets <0.1% reported spam and avoiding >=0.3%; unsubscribe processing within 48 hours is stricter than Resend's stated seven days. Prefer immediate suppression. Workspace recipients are outside this particular personal-Gmail guideline scope. Postmaster metrics are daily and may be unavailable; local complaint ratios have different coverage/denominators and must be labeled separately.

G3/G4/G5 document conversation workflows, labels instead of exclusive folders, archive retaining searchable history, snooze and accessible keyboard actions. Scheduled send is distinct from Undo Send; do not describe cancellation after provider submission as recalling delivered mail. Adopt readable thread hierarchy, clear selection counts, persistent drafts and explicit time zones; preserve plain-text rendering, blocked remote images and private attachments required by ADR 0002. Reference functionality is not a committed implementation promise.

## Resend policy and reliable transport

R1 prohibits unsolicited mail including cold outreach, purchased lists and scraped data; explicitly opted-in recipients are required. Complaint rate must be <0.08% and bounce rate <4%; exceeding either may cause shutdown without warning. Quota circumvention across accounts is prohibited. These ceilings are not operating targets, and synthetic positive replies do not establish consent. A reply workflow still needs an appropriate authorized purpose and recipient evidence; ambiguous legacy correspondence should be held for review rather than marked opted-in by an open/click.

R2 currently documents default 10 requests/second/team across API keys, dynamic limit/retry headers and 429 responses. Free daily quota resets midnight UTC; paid sending plans have monthly rather than daily quotas; both sent and received mail consume quota. Actual plan/limit remains unknown. Reserve capacity for inbound retrieval and reconciliation; use one team budget, bounded retries and explicit quota pause rather than repeated dispatch or automatic upgrade.

R3 automatically suppresses hard bounces and complaints, allows manual entries, and applies suppressions across the entire provider team/domains. Suppression-added/removed and email-suppressed events are documented. Removal does not ensure delivery; a fresh adverse result suppresses again. Local opt-out remains authoritative even when a provider entry is removed; never automatically clear a complaint.

R4/R5 support verified webhooks, replay and recipient-specific delivery outcomes. Proposed handlers persist authenticated events before ACK, deduplicate, retain original chronology and reconcile without overwriting terminal adverse recipient outcomes. A multi-recipient message must not become “delivered to all” from one recipient success. Provider acceptance, recipient-server delivery, inbox placement and human reading are separate facts. R6 documents inbound listing/attachments; route by trusted envelope data and copy required history into Elevateo under approved retention. Supabase is private application data/storage, not SMTP/IMAP; beta provider inbox features are not needed to replace the accepted backend.

## Original mailroom proposal and sequenced tickets

These are proposed child tickets for root to approve/schedule, not created GitHub issues or implemented routes. Extend Rails/Postgres and existing MailroomGateway; reconcile current contracts before adding fields. Keep test/live identities, provider teams/keys and event provenance separate. Simulator is the only transport in this phase.

| Sequence / proposed ticket | Owner | Implementation-ready behavior / acceptance |
|---|---|---|
| 1 RES-406-E1 evidence closure | Root/Nadia | Supply REA skill and sanitized Accounts/Unibox/Gmail captures with UTC time, visible fields, action boundary and evidence path. Label each as reported/observed; no bodies, addresses or secrets in Git. |
| 2 BE-403-H1 account health contract | Rowan/Soren | Tenant-scoped account/domain evidence: signal, status unknown/pending/verified/failed/stale, observed_at, source, expiry, reason_code. Separate record presence, provider verification and actual authenticated-message result; MX receiving distinct from send auth. No client secrets. |
| 3 FE-405-H1 health drawer | Mira | Compact “Needs attention” panel with concrete failed/stale checks and last-check/source details. Display no-data as unknown; simulated values visibly simulated. Show external sending held. Accessible text/icons and keyboard focus; no reputation percentage. |
| 4 BE-403-D1 dispatch eligibility | Rowan | Persist permission evidence reference, purpose, opt-out/suppression cause and scope. Recheck authorization/consent/suppressions at dispatch, not only draft creation. Hold unsupported or unknown purpose. Existing frozen send snapshot/lease remains authoritative; cancel safely before claim, retain ambiguous attempts as unknown. |
| 5 BE-403-D2 event reconciliation | Rowan | Unique provider/team/event identity, authenticated recipient routing, recipient-specific outcomes, monotonic adverse state, replay-safe suppression, received/occurred times. Queue age/import lag/unknown attempt counters; no bodies in operational logs. |
| 6 FE-405-M1 mailroom workflow | Mira | Sidebar mailbox/assignment/status, conversation list and plain-text reader, draft saved/conflict/offline feedback. Delivery drawer distinguishes queued/submitted/delivered/bounced/complained/unknown and per-recipient differences. Pending controls have honest labels; unsupported mutations disabled. |
| 7 BE-403-V1 genuine gradual volume | Rowan/Root | Configurable team/domain/account budgets under actual provider limits, explicit operator-reviewed increases based on genuine consented traffic and observed outcomes. No universal daily ramp or automatic reputation repair. Any complaint/hard bounce suppresses recipient immediately; configurable incident hold can precede provider ceilings. |
| 8 FE-405-M2 later workflow | Mira/Rowan | Saved views, multi-labels, assignment ownership, reminders/templates and scheduled drafts only after contracts exist. Explicit UTC storage/local zone preview, optimistic versions, permission recheck at wake/dispatch, no post-submission recall claim. |
| 9 QA-404-D1 verification | Elara/Soren/Root | Container integration plus actual visual QA below; root retains activation/release gate. |

Premium quality comes from calm information hierarchy, reliable saved state, clear ownership and precise recovery actions. Keep internal read/unread/assignment separate from external engagement tracking. Templates insert editable text and never send autonomously. AI may draft under scoped authorization but cannot treat incoming content as instructions or acquire send rights. Search stays membership-scoped; labels and conversation resolution cannot grant access.

## Strategic tradeoffs

| Choice | Benefit | Cost/risk | Recommendation |
|---|---|---|---|
| Synthetic warmup pool | Vendor claims earlier reputation signals | Real sending, manufactured engagement, sensitive mailbox access, uncertain provider acceptance/causality | Do not implement or activate. Discuss only as documented reference behavior. |
| Genuine gradual consented traffic | Demand-linked volume and honest feedback | Slower growth; small samples cannot prove placement | Adopt configurable monitored budgets after activation authorization. |
| Opaque single health score | Fast scanning | Hides unknowns and creates false certainty | Use evidence-backed checks and actionable severity with timestamps. |
| Pixel/link tracking | Vendor analytics | Privacy, proxies/scanners and misleading read inference; conflicts plain-text direction | Omit by default; use operational outcomes and actual replies. |
| Team-wide suppression | Protects against repeat adverse sending | Cross-domain effects and potential cross-tenant information disclosure | Mirror provider scope, expose only authorized reason/action, separate provider teams where isolation requires it. |
| Scheduled send/Undo | Operator convenience | Races with lease/provider acceptance and membership changes | Add only with explicit cutoff, dispatch rechecks and truthful cancellation feedback. |
| New provider inbox backend | Potential managed workflows | Beta/retention coupling, duplicate domain authority | Retain accepted Rails/Postgres mailbox; evaluate later with measured need. |

## Test plan, results and blockers

Planned checks are NOT_RUN. Soren alone schedules Docker; root alone desktop capture/visual QA. Nadia ran read-only repository inspection and public-document retrieval, then documentation edits. No builds, app tests, installations, live mail, DNS changes, warmup toggles or account connection occurred.

QA-404-D1 fixtures: (1) valid consented draft with all evidence and deterministic simulated delivery; (2) null/missing/stale DNS/provider data shows unknown and never verified; (3) recipient opt-out or membership revocation between approval and dispatch prevents submission; (4) authenticated duplicate/reordered recipient events preserve outcomes and suppression; (5) invalid signature/cross-tenant events fail without leaking identities; (6) unknown timeout/expired lease cannot become success or duplicate submission; (7) team-level 429/quota reset pauses correct budget without alias/key bypass; (8) empty/large lists, bounded pagination and no repeated per-row health queries; (9) scheduled cancellation/lease race and timezone/DST; (10) unread/archive/assignment state does not imply external read receipt; (11) live/test events and storage remain isolated. Use real container PostgreSQL for atomicity and current membership, deterministic provider fixtures for failures.

Visual acceptance: keyboard/screen-reader navigation, focus return, no-data/error/stale states, draft conflict/lost ACK, mobile widths, per-recipient delivery explanation, no invented active connection, and no enabled live/warmup controls. Root captures exact baseline/hash, environment and timestamps. Review future source in <=200-line assignments under full INT-401 rubric with a dedicated design-tradeoff reviewer; current documentation is not source coverage and defects/KLOC is N/A.

Open blockers: REA skill not supplied; root redacted runtime evidence absent; actual mailbox inventory/plan/provider quotas/consent history unknown; integration tests and independent review pending. No dependency on app baseline remains for this documentation checkpoint: root's attempt-2 baseline was verified at HEAD. Root can merge this bounded research while those gates stay explicit.
