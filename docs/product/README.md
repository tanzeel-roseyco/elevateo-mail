# Elevateo Mail product guide

Elevateo Mail is the Elevateo team's self-hosted email and outreach application. Staff use it to read and answer company mail from shared and private mailboxes, run consent-based campaigns, and find business email addresses.

This guide is for people who use the application. To install or run it, read the [handoff guide](../handoff/README.md).

The product is not deployed yet. Some client apps have not completed their final build and test pass. See [Current state](../../README.md#current-state-2026-10-30) in the root README.

## Who is responsible

| Person | Responsibility |
| --- | --- |
| Tanzeel | Did most of the development. Maintains the product with Jeison. |
| Jeison | Sets the product up on company infrastructure. Maintains it with Tanzeel. |
| Callum | Reviews the work, approves it, and decides which updates happen. |

## Sign in

Sign in with your company account through Authentik, the company's single sign-on service. You see only the mailboxes your organization has given you access to.

Clients exist for web, macOS, Windows, Android and iOS. They all connect to the same server. To add the web app to your device, read [Install the app](install-app.md). For the look of the app, read [Appearance](appearance.md).

## Read mail

1. Open **Inbox** to see mail from all your mailboxes, or select one mailbox.
2. Open a thread to read its messages.
3. Use folders, stars and snooze to organize threads.
4. Use **Search** to find messages.

Messages always appear as plain text. Elevateo Mail does not render message HTML, so formatting from the sender may be missing.

## Write and send mail

Every message needs a person's approval before it is queued.

1. Write a new message, reply, reply all or forward. Your work is saved as a draft.
2. Select **Review send**. Simulated installations label this **Review simulated send**.
3. Check the sender, purpose, all recipients, subject, message and attachments.
4. Tick the confirmation box and approve.
5. Follow the result on the send status page.

The review screen shows the sending mode. In **held** mode, nothing leaves the server. New installations start in this mode. A badge also tells you when a send is simulated.

If you change the draft after reviewing it, load a fresh review. An approval covers one saved version only.

### Why a send can be blocked

| What you see | What it means | What to do |
| --- | --- | --- |
| Approval blocked: consent required | A recipient has no recorded consent evidence. | Record consent evidence under **Outreach > Leads**, if the recipient really gave it. |
| Suppressed recipients | A recipient is on the suppression list, for example after a bounce or complaint. That recipient will not get the message. | View the mailbox's suppressions. Suppression is managed by the server. |
| Sending blocked: security scan not passed | An attachment has not passed its security scan. | Remove the attachment or wait for the scan. |
| A fresh review is required | The draft or review changed. Your text is kept. | Load a fresh review. |
| Approval may have been stored | The connection failed, so the result is unknown. | Use **Retry original approval**. Do not create a replacement draft, because that could send the message twice. |

### Sending limits

The system allows at most 30 sends per mailbox and 300 per user each day.

## Run outreach

Outreach covers campaigns, short sequences and leads.

Only contact people with recorded consent. Bounces and complaints are suppressed permanently. Campaign messages go through the same review and approval as other mail.

## Find email addresses

**Email finder** has four tools: person lookup, address verification, company emails and decision makers.

Person, verification and decision-maker jobs also accept a UTF-8 CSV of up to 2 MB and 5,000 rows:

| Job | CSV headers |
| --- | --- |
| Person | `name,domain,company` |
| Verification | `email` |
| Decision maker | `company,domain,role` |

Person and decision-maker rows need a domain or a company. Downloads include status, confidence, reasons, sources and check time.

| Status | Meaning |
| --- | --- |
| `valid` | The mail server accepted the address in a check. This does not guarantee delivery or give permission to contact the person. |
| `invalid` | The check found the address invalid. |
| `risky` | The address is uncertain, for example because the domain accepts every address. |
| `unknown` | The check could not decide. |
| `sources_unavailable` | Data sources could not be reached. This does not mean the person or address does not exist. |
| `suppressed` | The address, domain or person has opted out or been suppressed. |

Address checks are limited to 50 per day across the whole system, so large jobs can wait and resume later. A check never sends an email.

## Use Claude or Codex with your mailbox

A connector lets Claude or Codex search and read mail and write drafts, within the access granted to you for each mailbox. It cannot send mail. You approve any draft in Elevateo Mail in the usual way.

Mail the assistant reads is passed to that AI service. Connect only mailboxes your company allows for this use.

The desktop apps also have an assistant panel that uses the Codex and Claude command-line tools installed on your computer.

## Get help

Contact Jeison or Tanzeel about problems with the application. Send requests for product changes to Callum, who decides which updates happen.
