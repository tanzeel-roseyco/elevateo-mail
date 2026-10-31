# ADR 0002: accepted local architecture and execution boundaries

> Implementation update: this is a historical local architecture decision, not a current release inventory. Rails remains the backend. Windows source now uses Avalonia (`apps/windows`), and the Android shell uses Tauri (`apps/native`); the WPF/WebView2 and Java platform choices below are superseded. Source presence does not prove signed releases or native authentication integration. See the [handoff](../handoff/README.md).

Status: accepted local direction, 2026-10-12. Production activation is not authorized. Application implementation is not yet complete.

Astra MAX (`gpt-6-astra`, effort `max`, `/root/plan_synthesis`) synthesized three independent exact-model initial opinions at base `103baeb042925badbbc50dc0d3d3bfbf09ce8344`. The [decision record](../../.planning/consultations/results/initial-plan/accepted-decisions.md) is incorporated here as the normative set D-01 through D-10. [Synthesis and retained dissent](../../.planning/consultations/results/initial-plan/synthesis.md) and [runtime evidence](../../.planning/consultations/results/initial-plan/metadata.json) establish scope and provenance.

Rails API and worker own one business domain and application migration lane. Real Supabase Auth, PostgreSQL and private Storage provide local infrastructure. Restricted database roles, transaction-local identity, current membership and actual negative tests enforce isolation. Every bounded implementation still requires its own three opinions and Astra MAX synthesis.

Approval consumes a draft once, freezing its send payload atomically with the job and audit. A deliberate resend requires a new cloned draft. Stale workers cannot alter current state, but authenticated provider observations are retained for a fresh fenced reconciler. Restores begin with a dispatch hold outside the restored database; the simulator ledger remains outside the backup boundary.

Auth email stays capture-only or disabled, with runtime network egress denied. Message content is plain text under the user's explicit rule. React is shared by web and desktop hosts; macOS uses Tauri, Windows initially WPF/WebView2, Android Java and iOS SwiftUI. Separate Codex and Fable adapters cannot acquire send authority. Native deliverables retain actual platform-validation gates.

This supersedes earlier simultaneous Node backend and Tauri-for-both defaults, and later prose proposing HTML message display. ADR 0001's mailbox ownership remains intact. Hosting, real mail, DNS, signing and production release remain separate activation decisions. The unavailable Obsidian connection is recorded as a capability gap; analytical scenarios do not count as its execution.

## BE-01 foundation refinement

The task-specific [accepted decisions](../../.planning/consultations/results/be-01/decisions.md) refine this ADR: five backing services; direct PostgreSQL pooling with parameterized transaction-local app.user_id/app.org_id; hidden application schema denied to public Supabase roles; API read-only and worker no business grants in this slice. A server-only Storage HTTP service credential is the narrow exception to the earlier blanket service-role wording; it never becomes the Rails DB login or a client credential. Runtime request authentication remains BE-02. These refinements preserve the frozen initial consultation evidence.
