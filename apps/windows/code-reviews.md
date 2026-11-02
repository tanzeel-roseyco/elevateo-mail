# Windows P27–P34 repair review

Scope: Windows repairs only. Read against `.planning/STANDARDS.md`. Reviews used the repository's adversarial rubric, with source chunks at most 200 lines and totals below 400 per reviewer. Styling is delegated to compiler/analyzers.

| Review | Source coverage (lines) | Defects | Defects/KLOC | Disposition |
| --- | ---: | ---: | ---: | --- |
| API boundary | 340 | 1 | 2.94 | Require the contract's `read: true` capability; regression added |
| Authentication/configuration | 393 | 0 | 0 | Socket callback, bounded parsing, credentials and URL normalization accepted |
| State/pagination | 267 | 1 | 3.75 | Canceled current loads must release loading flags; ownership check and two-case regression added |
| State follow-up | 35 | 0 | 0 | Cancellation fix accepted |
| Packaging | 200 | 1 | 5.00 | Inverted grep could falsely pass under `set -e`; explicit failure branch added |
| Views/assistant/services | 388 | 0 | 0 | Added delayed assistant-session and stream reset coverage |
| Dedicated design tradeoffs | 200 | 0 | 0 | Session cancellation, explicit pagination and fresh-login recovery accepted |

Checklist: null/nested/bounds validation; header/body deadline and transport failure; credential atomicity; callback transport isolation; URL prefix preservation; stale reads/saves/assistant output; pagination retry/cancellation; context invalidation; responsive reader and simulation labels; exact-file uninstall; pinned toolchain; regression harness disposal and bounded waits.

Design simulations: a late read after sign-out cannot populate a later account; superseded loads cannot clear the replacement's loading state; credential erase failure clears private UI first; failed continuation preserves rows/cursor for retry; empty mailbox refresh clears old conversation. Explicit pagination avoids eager unbounded loading. Fresh sign-in after context conflict avoids replaying writes across authorization changes. No Obsidian connection was available, so these simulations were performed analytically and recorded here rather than in Obsidian.

Native Windows installation, standard-user browser sign-in and Credential Manager integration remain release acceptance checks; Linux Docker exercises socket behavior and credential-store doubles. No server or contract files were changed.

Current bounded reviews and passing runtime evidence: ../../docs/completion/final-readiness-20261101/windows-receipt.md. Final repair packets 48 and 57 LOC: zero defects, 0/KLOC.
