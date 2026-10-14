# Secondary mailserver R&D reference

Read-only factual roster copied from the separate R&D project docs/mailserver/team.md; branch ownership remains separate and Soren application queue takes priority. This does not integrate R&D implementation.

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