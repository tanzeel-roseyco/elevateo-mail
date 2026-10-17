# Security policy

Elevateo Mail stores company correspondence, mailbox credentials and outreach contact data. Reports of security problems are welcome and handled as described here.

## Reporting a vulnerability

Report privately. Do not open a public issue or discuss the problem in a public channel.

1. Use GitHub private vulnerability reporting ("Report a vulnerability" under the Security tab of this repository).
2. If that is unavailable, contact the repository owner directly through the company's private channel and mark the message as a security report.

Include the affected component (web, server, native, android, ops), steps to reproduce, the impact you observed and any proof-of-concept. Do not send real mailbox credentials, real recipient data or exported message content; synthetic data from `apps/web` fixtures mode or the local Compose stack is enough.

## What to expect

| Step | Target |
| --- | --- |
| Acknowledgement | 2 business days |
| Triage and severity | 7 days |
| Fix or mitigation for critical and high severity | 14 days |
| Fix for medium and low severity | next scheduled release |
| Coordinated disclosure | 90 days after the report, or earlier once a fix ships |

Severity follows CVSS v3.1 as a guide; anything that lets one tenant read another tenant's mail, bypasses send approval, or exposes stored mailbox credentials is critical.

## Scope

In scope: `apps/server`, `apps/web`, `apps/native`, `apps/android`, `contracts`, `ops` and the deployed pilot. Out of scope: `third_party/upstream` (vendored reference snapshots that are not deployed), social engineering of staff, physical attacks and denial of service.

## Rules for testers

- Test only against your own accounts on the local stack or a pilot account you were given. Never send mail to real recipients through the application.
- Do not access, modify or delete data that is not yours; stop and report as soon as you can demonstrate the problem.
- No automated scanning against the production host without written agreement.

The company will not pursue legal action against good-faith research that follows these rules.

## Supported versions

Only the `main` branch and the currently deployed pilot build receive fixes. There is no long-term support branch.

## Operational contacts

The pilot has a named owner who answers in business hours (Australia/Sydney). Incident handling, key rotation and data-subject requests are described in `docs/runbooks/incident-response.md`; device loss in `docs/runbooks/stolen-laptop.md`; recovery in `docs/runbooks/disaster-recovery.md`.
