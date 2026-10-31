> **Historical coordination roster.** These named research lanes and NOT_RUN checkpoints describe the earlier mailserver investigation. They do not assign current ownership or describe current readiness. Tanzeel did the bulk of development; Jeison and Tanzeel maintain the product together; Callum decides updates, reviews and approves them. See the [handoff](handoff/README.md) and [mail development account](handoff/mail-server-development.md).

# Secondary mailserver R&D reference

Factual roster at coordination d4bfa21; separate ownership, no app implementation imported.

# Mailserver R&D team — 2026-10-14

Coordinator: Jules ADV-733. Application delivery remains the priority. Six new visible local Orca tabs carry SSH only; Codex runs entirely on fleet-02. This is a manual SSH-backed worker group, not six Orca federated Dispatches. Shared report/control files replace the unavailable local message bus.

Requested configuration: authenticated Codex 0.160.0, gpt-6.1-sol, low reasoning, fast tier/mode, task-local YOLO. Launch command proves requested flags, not a provider billing/tier guarantee. Each transcript positively records thread.started and turn.started.

| Worker | Ticket | GitHub | Branch | Orca terminal handle | Remote runner PID |
|---|---|---|---|---|---|
| Aster | OFF-501 / MAIL-501 | https://github.com/tanzeel-roseyco/elevateo-mail/issues/16 | mail/aster-architecture | term_a7956ab1-71f0-4293-85ef-acf3f3be98da | 2029640 |
| Rhea | OFF-502 / MAIL-502 | https://github.com/tanzeel-roseyco/elevateo-mail/issues/17 | mail/rhea-delivery | term_0598b807-0140-44c0-8b68-cebb07374c94 | 2030185 |
| Corin | OFF-503 / MAIL-503 | https://github.com/tanzeel-roseyco/elevateo-mail/issues/18 | mail/corin-mailbox-storage | term_fb7ab031-f4a2-4b7f-85aa-0692342b156f | 2032210 |
| Vesper | OFF-504 / MAIL-504 | https://github.com/tanzeel-roseyco/elevateo-mail/issues/19 | mail/vesper-provider | term_d01e6356-742a-410e-9812-55a4640792e4 | 2031685 |
| Leonie | OFF-505 / MAIL-505 | https://github.com/tanzeel-roseyco/elevateo-mail/issues/20 | mail/leonie-hetzner-pilot | term_c2793fdb-b1bf-492c-b87b-5e7cd7d0fe91 | 2032209 |
| Darius | OFF-506 / MAIL-506 | https://github.com/tanzeel-roseyco/elevateo-mail/issues/21 | mail/darius-security-qa | term_217ccd7f-7e42-448b-8e94-7e8f5f61b2e1 | 2032687 |

Base: 59a8ce66dfa86dd3618712c129c66598234a31a0. Remote checkouts: /home/tanzeel/elevateo-mail-rd-20261014/<name>. Reports and start evidence: reports/<name>-events.jsonl, <name>-runner.pid, <name>-branch.txt; bounded exit: <name>-exit.txt. Prompt and terminal receipts retained under ops/local/mailrd-20261014.

Soren OFF-402 remains sole Docker owner; scheduler inbox was informed this group is SECONDARY. Leonie OFF-505 collects one reviewed immutable synthetic fixture request after the app queue clears: maximum 2GiB RAM, 2 CPU, 5GiB disposable disk, 15 minutes, preserving 8GiB reserve. No new paid resources, DNS/MX changes, public service, external mail or host configuration changes. No tests or Docker work performed by this coordinator.

Ada starting recommendation is Mox localserve for the private fixture; Aster owns a bounded evidence-based final choice and adapter contract. Production Docker support and mailbox-versus-tenant boundaries must be explicit. Review packets capped at 200 unique LOC; implementation tests and independent review remain pending.

Workers were launched and their turns started; this does not establish completed R&D, passed security gates, production readiness or application completion.
## First slices settled — 2026-10-14
All six remote runs exit0; all six owned checkouts clean. Sources and remote reports retained. Six positively verified idle manual SSH shell tabs closed through Orca terminal close, each ptyKilled:true. No new tasks or Docker while application queue remains active.

| Worker | Exact final commit | Evidence / remaining gate |
|---|---|---|
| Aster #16 | 0ab568b50a98d5bef52d39f520fc44cc58fbc63f | Mox localserve provisional; 164 doc LOC zero findings; two pilot initialization/restart defects block runtime |
| Rhea #17 | 0ea1c652d64e5f7c40dd8d32fc59f38b7b28aada | Offline validator/fixtures; 185 Python LOC zero defects; two JSON fixture lines review pending |
| Corin #18 | add0f84235a509733b15169fcf499850ee137a9a | Account validator/restore; one review defect fixed with regression; repair review pending |
| Vesper #19 | d39ac982bf8565cd1a9c97f292255697602923f2 | Disabled synthetic provider contract/types/fake tests; independent review pending |
| Leonie #20 | 28c21a887ab63c8f5a35690f6e0ed6cca5033124 | Private Compose candidate/provenance/native runbook; independent review pending |
| Darius #21 | fcd23438565e918b6c540325c62c60a8bec0fa3c | Synthetic SMTP/IMAP harness; password-boundary defect fixed; re-review pending; two pilot defects reported |

Every Docker/runtime gate is NOT_RUN. No spend, external mail, DNS, infrastructure change or deployment. Full evidence: /home/tanzeel/elevateo-mail-rd-20261014/reports/{name}-final.md, {name}-last-message.md, {name}-events.jsonl and {name}-exit.txt. Commits are source slices, not runtime acceptance. Root owns actual Obsidian vault mirror.