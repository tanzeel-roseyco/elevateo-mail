# Engineering standards — APPROVED 2026-10-01 (frontend prototype)

Scope: frontend-only interactive prototype of the Elevateo Mail dashboard (formerly Outreach Mailroom). No backend, no real
sending, no Resend calls, no DNS changes. Each section was approved by the user on 2026-10-01, with Tailwind chosen for styling. Backend standards will be drafted separately when backend work is scoped.

## 1. Language and framework versions
- TypeScript 5.x, `strict: true`, `noUncheckedIndexedAccess: true`. No `any` without an `AIDEV-NOTE`.
- React 19 + Vite 7 single-page app. Node 24 for tooling.
- React Router 7 (data-router, library mode) for routes, back/forward, and deep links.
- Dependencies (each justified):
  - `zustand` — small store with a persistence middleware; avoids hand-rolled localStorage sync.
  - `zod` — validates everything read from localStorage and the mock CSV import.
  - `@radix-ui/react-dialog`, `@radix-ui/react-alert-dialog` — accessible, focus-trapping dialogs and drawers;
    styled by us. Other controls use native elements.
  - `lucide-react` — icon set.
  - Dev only: `vitest`, `@testing-library/react`, `@playwright/test`, `eslint`, `typescript-eslint`.
- Tailwind CSS 4 (`@tailwindcss/vite`) for styling. Design tokens are CSS custom properties mapped into the
  Tailwind theme, so runtime accent, background, density, and theme controls restyle utilities live.

## 2. Architecture and layering
Feature-sliced, dependency direction pointing inward:

```
src/
  app/            router, shell (sidebar, top bar, global search), providers
  domain/         pure types + rules (identities, suppression, send validation, filters). No React.
  data/           ports (repository interfaces) + mock adapters + seed data
  features/       overview/ mail/ compose/ campaigns/ contacts/ settings/
  ui/             reusable components (Button, Dialog, Toast, Chip, Table, EmptyState, …)
  styles/         index.css (tokens + Tailwind theme mapping)
  lib/            tiny framework-free helpers
```

- `domain/` never imports from `features/`, `ui/`, `data/` adapters, or React.
- Features talk to data only through ports in `data/ports.ts`. A future Resend-backed API replaces the
  mock adapters without touching features. No other speculative infrastructure.
- Mock adapters are async and simulate latency/failure so loading and error states are real.

## 3. Naming and comments
- Domain names over generic ones (`SenderIdentity`, `SuppressionReason`, `CampaignStep`).
- Component files `PascalCase.tsx`, everything else `camelCase.ts`. One page-level component per file.
  Private helper components used only by that page, and small primitives of one family in `ui/`
  (e.g. `Field.tsx`: Field, Input, Select), may share its file.
  _Amended during implementation from "one component per file, hooks in `useThing.ts`"; flagged to the
  user for confirmation._
- `AIDEV-NOTE/TODO/QUESTION` anchors (≤120 chars) at non-obvious decisions; every non-trivial module
  has one stating its role. Comments explain why, and are updated with the code they describe.

## 4. Errors and boundaries
- Boundaries are: localStorage, CSV import, URL params, user form input. All parsed with zod.
- Corrupt persisted state falls back to seed data with a visible toast, never a blank screen.
- Route-level error boundary plus per-panel error states with retry. No swallowed catches.
- Domain rules return explicit results (`{ ok: true } | { ok: false; reasons }`), e.g. send validation.

## 5. State management
- URL is the source of truth for navigation state: page, folder, open thread, filters, search query,
  campaign tab. This is what preserves filters when opening/closing a conversation.
- Zustand stores for mock entities (messages, campaigns, contacts, identities) and preferences,
  persisted to localStorage under a versioned key with a migration hook.
- Ephemeral UI state (composer open/minimised, selection) stays in component or store memory.

## 6. API / data-contract conventions
- Ports return plain serialisable DTOs with ISO-8601 timestamps and string IDs, shaped as a REST/Resend
  backend would return them. List methods take a filter object and return `{ items, total }`.
- Statuses are closed string unions. "Delivered" is never rendered or named as "read/opened".
- Every simulated action is labelled as simulated in the UI; the primary send action reads
  **Simulate send**. Domain verification is labelled mock data.

## 7. Testing and coverage
- All checks run in Docker on fleet-02: `eslint`, `tsc --noEmit`, `vitest`, Playwright e2e.
- Unit tests: every `domain/` rule (happy path + two most likely failures), ≥90% line coverage on
  `domain/`. Component tests for composer validation, bulk actions, and suppression blocking.
- Playwright e2e (desktop 1440px + mobile 390px): compose and simulate send, read and reply,
  campaign navigation and creation, contacts CSV import, appearance customisation, back/forward.
- Visual QA gate: screenshots of the main desktop and mobile flows inspected before any push.
- No numeric coverage bar outside `domain/`; behaviour-oriented tests over snapshots.

## 8. Security and privacy
- No credentials, API keys, or real personal data anywhere. All contacts and emails are fictional.
- Message bodies render as text / sanitised structured content; never `dangerouslySetInnerHTML` on
  user-entered or imported content.
- Background image is read locally (data URL), size-capped, never uploaded.
- Contact views show only what the workflow needs: name, email, company, tags, consent, subscription.
- Suppressed, bounced, and unsubscribed contacts are blocked from simulated sends in the domain layer.

## 9. Accessibility and responsive
- WCAG 2.2 AA: semantic controls, visible focus, labelled inputs, 4.5:1 text contrast in both themes and
  with any user-chosen accent/background (overlay enforced), status never by colour alone.
- Dialogs trap focus and close on Escape. Full keyboard operation of mail list and composer.
- Desktop first (≥1200), tablet (768–1199), mobile (<768: sidebar drawer, list/detail mail flow,
  full-screen composer). `prefers-reduced-motion` respected.

## 10. Performance budgets
- Initial JS ≤ 250 KB gzipped; route-level code splitting for campaigns, contacts, settings.
- Mail and contact lists stay smooth at 900 contacts / 500 messages (windowing only if measured need).
- Interaction feedback under 100 ms; simulated latency capped at 600 ms.

## 11. Process
- Branch `feature/frontend-prototype`; atomic commits; README "Current state", `state.md`, and
  `documentation.md` updated in the same commits. Push only after all checks and the visual QA gate pass.
- After the build: adversarial review in ≤200-line assignments plus a dedicated design-tradeoff
  reviewer; findings, defect count, and defect density recorded in `code-reviews.md`.
- Docker cleanup (`builder prune -a -f`, `image prune -a -f`, never `--volumes`) after test runs.
