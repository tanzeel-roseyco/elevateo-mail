from __future__ import annotations

import html
import re
from pathlib import Path

from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parents[3]
TEMP = Path(__file__).resolve().parent
OUTPUT = ROOT / 'output/pdf/elevateo-mail-excalidraw-agent-brief.pdf'
INK = colors.HexColor('#192329')
MUTED = colors.HexColor('#53616A')
ACCENT = colors.HexColor('#5144CD')
PAPER = colors.HexColor('#FBFAF7')
LINE = colors.HexColor('#DEDCD5')
BODY = ParagraphStyle('Body', fontName='Helvetica', fontSize=10.2, leading=14.6, textColor=INK)
SMALL = ParagraphStyle('Small', parent=BODY, fontSize=8.9, leading=12.4, textColor=MUTED)
HEAD = ParagraphStyle('Heading', parent=BODY, fontName='Helvetica-Bold', fontSize=12, leading=16)

# AIDEV-NOTE: The prompt labels current frontend evidence separately from unapproved backend proposals.
PAGES: list[tuple[str, str, list[tuple[str, str]]]] = [
    ('Excalidraw agent brief', '01 / Product and boundaries', [
        ('intro', 'HOW TO USE: Copy the prompt on pages 1-4 and attach this PDF so the agent can see the mockups on pages 5-10. The same prompt and seven original PNGs are also embedded as PDF attachments.'),
        ('start', 'PROMPT START'),
        ('p', 'Act as a product designer and system architect. Create an editable Excalidraw planning board for <b>Elevateo Mail</b>. Explain it to a beginner in plain English. Use the attached Fable frontend mockups as the visual starting point. Improve workflows where useful, and explain each change beside its sketch.'),
        ('h', 'The product we are building'),
        ('p', 'A personal inbox and opted-in email campaign app for <b>10 completely separate users</b>, each with up to <b>10 connected mailboxes</b>. Google accounts may come from different organisations or personal Gmail. Users can connect mailboxes, add recipients and import historical messages.'),
        ('p', '<b>Limit: 30 outgoing emails per connected mailbox per day.</b> This includes manual, campaign and AI sends through the app. Aliases and reconnecting must not create fresh allowances. With 10 mailboxes, the ceiling is 300 per user and 3,000 across the pilot each day. Earlier 600-per-user wishes are superseded. Rolling 24-hour accounting and counting every To/CC/BCC recipient are proposals awaiting approval. External sending is outside the app\'s control.'),
        ('p', 'Support a web app and directly downloadable Windows and macOS apps, with their own window, icon and email notifications. Approved, fully prepared campaigns must continue in the cloud when the computer is off. Local CLI AI cannot run on a switched-off computer.'),
        ('p', 'Users bring their own Codex/Claude accounts and provider keys. AI may read selected mailboxes and prepare drafts by default; sending is enabled and approved separately. Hunter and AMF are optional <b>enrichment</b>; AI handles <b>personalisation</b>. AMF\'s exact product/API is still unidentified.'),
        ('h', 'Be precise about what exists'),
        ('p', 'Fable\'s Ledger frontend is an interactive prototype using fictional data and simulated sends. Its backend, real provider connections, AI bridge, DNS broker and desktop installers do not exist yet. Label every board section <b>Prototype</b>, <b>Proposed</b> or <b>Needs decision</b>. Screenshot counts are sample data, not capacity evidence. Backend standards still require approval.'),
        ('p', 'Target hosting below <b>A$15/month</b>, excluding email, AI, enrichment, signing and external approval costs. Show cost drivers and limits; do not promise this budget without measured usage. Keep CPU, memory and background work low. Correctness and privacy come before clever optimisation.'),
    ]),
    ('Draw the system', '02 / Board sections 1-4', [
        ('h', '1. The whole app at a glance'),
        ('p', 'Draw separate areas for the user\'s device, our cloud and outside providers. Proposed stack: shared React/TypeScript UI; Tauri 2 desktop wrapper; one modular Cloudflare Workers backend. D1 stores structured records, R2 stores bodies/files, Queues carries background work and a scheduled Worker finds due work. Explain each box in one line. Draw arrows labelled with the actual data or action.'),
        ('p', 'Show identity and permission checks at every user-data boundary. Each user owns their connections, messages, campaigns, files, keys and approvals. Use server-side ownership checks on every request and object access. Draw one backend with clear internal responsibilities, not a fleet of microservices.'),
        ('h', '2. Receiving mail and keeping the inbox current'),
        ('p', 'Gmail/Workspace: Google Pub/Sub change hint -> cloud sync job -> Gmail history/API -> saved message metadata -> UI and eligible device notification. Show watch renewal, missed-event recovery, expired login and visible last-sync time. Fetch bodies and attachments when needed. Treat email HTML and attachments as untrusted. Never render arbitrary email HTML directly into the app.'),
        ('p', 'Resend is proposed for eligible opted-in campaigns from owned, verified domains. It does not replace the connected personal inbox or let users send as arbitrary @gmail.com addresses. Route replies to a connected mailbox. Show authenticated, deduplicated provider events for delivery, bounce and complaints. Start self-hosted support with one tested, reachable HTTPS/JMAP provider; IMAP/SMTP needs its own compatibility and cost decision.'),
        ('h', '3. Sending safely, including when the device is off'),
        ('p', 'Draw: draft -> recipient/content approval -> durable send record and pending-job record saved together -> queue -> final checks -> reserve mailbox allowance atomically -> provider -> recorded result. Final checks include owner, sending permission, approved version, consent, unsubscribes/suppression, campaign state and provider limits. Edited recipients or content invalidate prior approval.'),
        ('p', 'The database is the record of truth; queue jobs may repeat. Show duplicate protection, fair per-user scheduling, backoff and failed work. A timeout may mean the provider accepted the email: label it <b>Unknown outcome</b>, hold reserved quota and investigate before retrying. Never promise exactly-once delivery. Pause blocks new dispatches; handed-off mail may complete. Unsubscribes and replies stop relevant future campaign work according to policy.'),
        ('h', '4. AI and DNS: separate, limited access'),
        ('p', 'Desktop UI -> local bridge -> Codex CLI -> permission-checked tool/MCP gateway -> selected mailboxes. Initially Claude fallback can only draft with tools disabled. Keep mailbox context disabled until provider data-use requirements and CLI isolation are verified. No browser-to-CLI bridge initially. One job at a time, cancellation, timeout and process cleanup. CLIs can send data to cloud services; Tauri permissions do not sandbox them. Email text never grants tool authority. Encrypt credentials; keep them out of prompts/logs. No silent permission escalation or fallback after an uncertain send.'),
        ('p', 'Draw DNS as a separate broker: exact approved subdomain/record -> before/after preview -> human approval -> audited change. Mail and AI workers receive no DNS credentials. Keep company root MX unchanged on boltloop.co, flooda.co and elevateoco.com; do not repoint existing in.elevateoco.com. Gmail API access needs no MX change. Provider zone-wide tokens do not prove subdomain isolation: keep writes manual until containment is proven.'),
    ]),
    ('Sketch the daily workflows', '03 / Board sections 5-6', [
        ('h', '5. Bring Fable\'s frontend into the board'),
        ('p', 'Embed all seven reference screenshots in labelled reference frames. Next to them, draw editable wireframes using Excalidraw shapes and text. Keep the calm Ledger style: light neutral surfaces, strong type, indigo accents, clear spacing, a compact sidebar and fast keyboard-friendly actions. Preserve the dark and mobile references. Use diagrams to explain behaviour, not just appearance.'),
        ('p', '<b>R1 Overview (page 5):</b> urgent work and failures first, then useful figures. Every figure opens the matching filtered list. <b>R2 Inbox (page 6):</b> mailbox/folder scope, visible filters, account identity on each row, bulk actions and undo. <b>R3 Split reader (page 7):</b> keep list context, read and reply without losing filters; make the sender account obvious.'),
        ('p', '<b>R4 Campaigns (page 8):</b> status, progress, replies, review and pause. <b>R5/R6 Mobile (page 9):</b> one pane at a time with easy back navigation and full-screen compose. <b>R7 Dark (page 10):</b> preserve contrast, focus and meaning without depending on colour.'),
        ('h', '6. Fill the missing product screens'),
        ('p', '<b>Connections:</b> Mailboxes, Sending, AI, Enrichment and Domains. Show capabilities, permission scope, last sync, remaining daily allowance, reconnect and revoke. Keys go into a secure connection form, never chat. Include account login/MFA and the Google connection flow as proposed screens; do not imply external Google approval is already complete.'),
        ('p', '<b>AI assistant:</b> selected-mailbox chips, exact context being shared, CLI status, stop button, editable draft and a separate sending approval. The app must still work when AI or enrichment is unavailable. Enrichment failure must not block inbox use.'),
        ('p', '<b>Campaign builder:</b> recipients -> consent checks -> message/personalisation -> schedule and mailbox limits -> final review -> activate. Explain what will run in the cloud, what is waiting on local AI and what pause can still stop. Optional Instantly/Smartlead support is a future adapter with only one scheduler controlling any campaign.'),
        ('p', '<b>Imports and recovery:</b> connect another mailbox, paste/import recipients, import old messages with preview, duplicates and errors. Show bounded progress and cancel. A lost connection or stale inbox must not look like an empty inbox. Include loading, empty, offline, permission denied, quota reached, failed and unknown-send states.'),
        ('p', '<b>Domain review and distribution:</b> draw an exact-subdomain DNS preview with root records visibly locked. Sketch a small download page with Open web app, Windows installer (.exe) and Mac download (.dmg), plus update status. Signing, macOS notarisation and platform release checks are planned work, not finished features.'),
        ('h', 'Connect screens to real responsibilities'),
        ('p', 'Beside each main screen add three short notes: <b>What the user does / What the backend must provide / What happens if it fails.</b> Sketch success and the most likely failure state. Label proposed data such as sender account, last sync, quota remaining, approval version and send status so the future frontend and backend agree. Never label delivery as proof that someone read the email.'),
    ]),
    ('Make it useful to build from', '04 / Board sections 7-8 and handoff', [
        ('h', '7. Efficiency, health and the build map'),
        ('p', 'Explain the low-cost choices: indexed, paginated lists; metadata first; lazy bodies/files; push-led sync with bounded recovery; small queue messages; batched imports; one on-demand CLI process. Keep long imports from starving inbox/send work. Queues already supplies background messaging: no Redis, Kafka, RabbitMQ or search cluster without measured need.'),
        ('p', 'Propose a small health screen for stale sync, queue delay, unknown/failed sends, revoked access, mailbox allowance, storage and backup age. Use bounded, redacted logs and an independent outage check. Show backup restoration and key recovery as required operational work. Do not build a full monitoring platform or assume a dashboard can detect its own outage.'),
        ('p', 'Draw the proposed repository map: apps/web, apps/desktop, apps/backend; packages/domain, contracts, providers and shared UI only when genuinely shared; migrations, infra, tests, docs and .planning. Explain each folder in a few words. Current frontend lives in src/; this is a future migration proposal, not a claim those folders exist. Avoid empty scaffolding.'),
        ('p', 'Show the few tests that protect the product: cross-user access denial, send/quota races, duplicate jobs, timeout reconciliation, consent/unsubscribe, pause, expired credentials, backup restore and critical desktop/mobile journeys. Use Docker, fake providers and existing Vitest/Playwright tooling for routine tests with no paid API calls. Real authorised provider checks and Windows/macOS release checks are still needed before launch.'),
        ('h', '8. Decisions and the smallest delivery sequence'),
        ('p', 'Create a short decision list: quota window and recipient counting; history/import/storage limits; login/MFA and data region; exact AMF and first self-hosted provider; external Gmail approval and permitted AI data use; DNS containment; backup/key recovery; signing owner and cost. Identify the consequence of each choice. Ten users is not proof of exemption from Google requirements.'),
        ('p', 'Draw stages: approve standards/provider requirements -> one mailbox -> two isolated users with reliable sync/send/recovery -> PC-off campaigns -> desktop/local AI -> 10-user load/cost checks -> optional providers. Ask targeted questions; mark unresolved decisions and continue independent diagrams.'),
        ('h', 'Required files and quality checks'),
        ('p', 'Deliver elevateo-mail-planning.excalidraw with editable boxes, text and connectors, all seven screenshots embedded, and a clear reading order across the eight sections. Also export a readable PDF and one PNG per main section. Keep the original screenshot reference frames and new wireframes separate; do not flatten the whole board into one image or rely on local image paths.'),
        ('p', 'Reopen the saved board in Excalidraw. Inspect every export for readable text, intact images, clipping, correct arrows and missing states. Add a legend and written status labels. Under each diagram explain: what it does, why, and what can fail. Verify new provider claims with official sources; cite them and flag assumptions. Do not deploy, send email, change DNS or create credentials.'),
        ('end', 'PROMPT END'),
        ('source', 'Brief basis: approved user requirements, product master plan, backend blueprint, distribution addendum and verified Fable frontend screenshots (4 October 2026). File-format reference: <link href="https://docs.excalidraw.com/docs/codebase/json-schema/" color="#5144CD">official Excalidraw JSON schema</link>. The files field holds embedded image data.'),
    ]),
]


def paragraph(pdf: canvas.Canvas, text: str, x: float, top: float, width: float,
              style: ParagraphStyle = BODY) -> float:
    item = Paragraph(text, style)
    _, height = item.wrap(width, 1000)
    item.drawOn(pdf, x, top - height)
    return top - height


def base(pdf: canvas.Canvas, page: int, size: tuple[float, float], label: str) -> None:
    width, height = size
    pdf.setPageSize(size)
    pdf.setFillColor(PAPER)
    pdf.rect(0, 0, width, height, fill=1, stroke=0)
    pdf.setFillColor(ACCENT)
    pdf.rect(36, height - 30, 20, 3, fill=1, stroke=0)
    pdf.setFont('Helvetica-Bold', 8)
    pdf.setFillColor(MUTED)
    pdf.drawString(64, height - 30, 'ELEVATEO MAIL / EXCALIDRAW BRIEF')
    pdf.setStrokeColor(LINE)
    pdf.line(36, 32, width - 36, 32)
    pdf.setFont('Helvetica', 8)
    pdf.drawString(36, 19, label)
    pdf.drawRightString(width - 36, 19, f'{page:02d} / 10')


def text_pages(pdf: canvas.Canvas) -> None:
    for page, (title, subtitle, blocks) in enumerate(PAGES, 1):
        base(pdf, page, A4, 'Planning brief | Proposed architecture; current frontend is simulated')
        pdf.bookmarkPage(f'prompt-{page}')
        pdf.addOutlineEntry(subtitle, f'prompt-{page}', 0)
        top = A4[1] - 61
        pdf.setFillColor(INK)
        pdf.setFont('Helvetica-Bold', 23)
        pdf.drawString(36, top, title)
        top -= 21
        top = paragraph(pdf, subtitle, 36, top, A4[0] - 72, SMALL) - 16
        for kind, text in blocks:
            if kind == 'h':
                top -= 4
                top = paragraph(pdf, text, 36, top, A4[0] - 72, HEAD) - 6
            elif kind in ('start', 'end'):
                pdf.setFont('Helvetica-Bold', 8.8)
                pdf.setFillColor(ACCENT)
                pdf.drawString(36, top - 10, text)
                top -= 22
            else:
                style = SMALL if kind in ('intro', 'source') else BODY
                top = paragraph(pdf, text, 36, top, A4[0] - 72, style) - 10
        if top < 40:
            raise ValueError(f'Page {page} overflows: bottom={top:.1f}')
        print(f'Prompt page {page}: content bottom {top:.1f}')
        pdf.showPage()


def image_in_box(pdf: canvas.Canvas, name: str, box: tuple[float, float, float, float]) -> None:
    path = ROOT / 'output/fable' / name
    with Image.open(path) as img:
        iw, ih = img.size
    x, y, width, height = box
    scale = min(width / iw, height / ih)
    rw, rh = iw * scale, ih * scale
    left, bottom = x + (width - rw) / 2, y + (height - rh) / 2
    pdf.drawImage(str(path), left, bottom, rw, rh, preserveAspectRatio=True, mask='auto')
    pdf.setStrokeColor(LINE)
    pdf.rect(left, bottom, rw, rh, fill=0, stroke=1)


def reference_pages(pdf: canvas.Canvas) -> None:
    references = [
        ('R1 / Overview', ['overview-light.png'], 'Start with work that needs attention',
         'Preserve Next up, clear failures and figures that open useful lists. Diagram link: campaign jobs, sending results and connection health. Add proposed stale-sync and allowance states; do not treat sample figures as real throughput.'),
        ('R2 / Inbox', ['inbox-desktop.png'], 'Make mailbox identity and scope unmistakable',
         'Keep the mailbox rail, visible filters, row identity and quick actions. Diagram link: indexed message lists and per-user ownership checks. Sketch empty, loading and disconnected states beside the happy path.'),
        ('R3 / Split reader', ['inbox-split-desktop.png'], 'Read and reply without losing your place',
         'Keep list context and the actual sender account visible. Diagram link: on-demand message body, draft storage and the final send gate. Add a clear quota or approval failure beside the reply action.'),
        ('R4 / Campaign management', ['campaigns-desktop.png'], 'See progress, then take the next action',
         'Preserve statuses, progress, reply figures and clear campaign entry points. Diagram link: cloud schedule, sending ledger and provider events. Sketch pause, consent checks and unknown-send recovery; delivery is not proof of reading.'),
        ('R5 + R6 / Mobile workflows', ['inbox-mobile.png', 'campaigns-mobile.png'], 'One focused task per screen',
         'Use a drawer for navigation and a list-to-detail flow for mail. Keep filters, mailbox identity and back navigation usable. Diagram link: the same permissions and backend contracts as desktop; a smaller screen gets no weaker rules.'),
        ('R7 / Dark appearance', ['inbox-dark.png'], 'Keep the same hierarchy in a different theme',
         'Preserve contrast, selected rows, readable labels and keyboard focus. Diagram link: shared UI tokens, not a second application. In proposed states, use words and icons as well as colour for errors, permissions and send status.'),
    ]
    size = landscape(A4)
    for page, (title, names, heading, caption) in enumerate(references, 5):
        base(pdf, page, size, 'Fable 5.1 Ledger frontend | Actual prototype capture | Fictional data; no real sending')
        pdf.bookmarkPage(f'reference-{page}')
        pdf.addOutlineEntry(title, f'reference-{page}', 0)
        pdf.setFillColor(INK)
        pdf.setFont('Helvetica-Bold', 20)
        pdf.drawString(36, size[1] - 60, title)
        pdf.setFont('Helvetica', 9)
        pdf.setFillColor(MUTED)
        pdf.drawString(36, size[1] - 76, ' + '.join(names))
        if len(names) == 2:
            image_in_box(pdf, names[0], (155, 115, 245, 389))
            image_in_box(pdf, names[1], (442, 115, 245, 389))
        else:
            image_in_box(pdf, names[0], (36, 115, size[0] - 72, 389))
        top = paragraph(pdf, heading, 36, 96, size[0] - 72, HEAD) - 4
        bottom = paragraph(pdf, caption, 36, top, size[0] - 72, SMALL)
        if bottom < 38:
            raise ValueError(f'Reference page {page} caption overflows')
        pdf.showPage()


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    draft = TEMP / 'brief-layout.pdf'
    pdf = canvas.Canvas(str(draft), pagesize=A4, pageCompression=1)
    pdf.setTitle('Elevateo Mail - Excalidraw Agent Brief and Fable Mockups')
    pdf.setAuthor('Elevateo Mail planning')
    pdf.setSubject('Copyable design prompt with seven original Fable prototype screenshots')
    text_pages(pdf)
    reference_pages(pdf)
    pdf.save()
    reader = PdfReader(draft)
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    # AIDEV-NOTE: Original attachments keep screenshot quality and filenames intact for the next agent.
    prompt: list[str] = []
    for _, _, blocks in PAGES:
        for kind, text in blocks:
            if kind not in ('intro', 'source'):
                prompt.append(html.unescape(re.sub(r'<[^>]+>', '', text)))
    writer.add_attachment('elevateo-mail-excalidraw-prompt.txt', '\n\n'.join(prompt).encode('utf-8'))
    for path in sorted((ROOT / 'output/fable').glob('*.png')):
        writer.add_attachment(path.name, path.read_bytes())
    with OUTPUT.open('wb') as stream:
        writer.write(stream)
    final = PdfReader(OUTPUT)
    text = '\n'.join(page.extract_text() or '' for page in final.pages)
    assert len(final.pages) == 10
    assert len(final.attachments) == 8
    for phrase in ('PROMPT START', 'PROMPT END', 'Unknown outcome', '3,000', 'R7 / Dark appearance'):
        assert phrase in text, phrase
    assert all(page.images for page in final.pages[4:])
    (TEMP / 'extracted-text.txt').write_text(text, encoding='utf-8')
    print(f'Created {OUTPUT}; {len(final.pages)} pages; {len(final.attachments)} embedded attachments')


if __name__ == '__main__':
    main()
