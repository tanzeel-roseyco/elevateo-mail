# Outreach Mailroom

A planned Gmail-style application for managing consent-based email outreach, campaigns, and conversations across approximately 18 mailboxes (mailbox interpretation unconfirmed).

## Current state
Repository initialized with planning documentation only. No application has been implemented. Requirements, providers, stack, and engineering standards await decisions and approval.

## Stack and architecture
Proposed: modular backend, background worker, PostgreSQL, and a provider integration. Redis is optional. Campaign scheduling must have one authoritative owner. Resend application notifications should be operationally separated from outreach. No provider selection is approved.

## Setup and run
Clone the repository and read documentation.md and .planning/STANDARDS.md. No runtime or installation steps exist yet.

## Testing and deployment
No executable code or test suite exists. Future application checks must run in Docker: lint, typecheck, unit and integration tests, plus actual UI visual validation before deployment. This repository initialization does not deploy an application.

## Planning documents
- documentation.md: product context, proposed architecture, open questions
- state.md: current status and next steps
- .planning/STANDARDS.md: proposed engineering standards requiring explicit approval
- AGENTS.md: implementation and review instructions
- code-reviews.md: review coverage and findings
