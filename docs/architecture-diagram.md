# Elevateo Mail architecture diagram

Updated 2026-10-13. User-selected stack: **Rails domain backend + Laravel Blade/Livewire web UI + self-hosted Supabase + Resend**. This is a design diagram, not deployed infrastructure. Local tests replace external mail transport with the durable simulator; live sends and Instantly warmup remain disabled.

```mermaid
flowchart TB
    Browser["Web browser"] -->|"HTTPS and session cookie"| Web["Laravel presentation server<br/>Blade + Livewire + Alpine.js"]
    Remote["Desktop mailbox WebView<br/>no native privileges"] -->|"HTTPS and separate web session"| Web
    Web -->|"Allowlisted API calls with individual user identity"| API["Rails API<br/>authorization and domain commands"]
    Web --> Sessions[("Private presentation-session store<br/>separate role and encrypted credentials")]
    Mobile["Java Android / SwiftUI iOS"] -->|"Scoped user API access"| API
    MCP["Mailbox MCP<br/>read, search and draft"] --> API
    Panel["Separate trusted desktop CLI panel"] --> Bridge["Native Codex / Claude adapters<br/>explicit tools and data grants"]
    Bridge -->|"Scoped mailbox tools"| MCP
    API --> Auth["Supabase Auth"]
    API --> DB[("Supabase PostgreSQL<br/>mail records, jobs, audit and outbox")]
    API -->|"Authorized streaming proxy"| Storage["Private Supabase Storage"]
    Worker["Rails worker<br/>same domain code, separate process"] -->|"Lease jobs and reconcile"| DB
    Worker --> Storage
    Worker --> Scan["Isolated attachment scanner"]
    Worker -->|"Only mail submission authority"| Transport["Resend in authorized live mode<br/>durable simulator in local mode"]
    Transport -->|"Signed incoming and status events"| Hook["Rails webhook receiver"]
    Hook -->|"Persist before acknowledgment"| DB
```

There is deliberately **no connection from the remote mailbox WebView to the native CLI panel or its IPC**. They do not share a JavaScript bridge, host objects, pairing tokens or credential store. The trusted panel obtains explicitly granted mailbox context through the API/MCP; remote page events cannot authorize local execution.

Laravel handles presentation and browser session/CSRF protection. Rails owns every mailbox permission decision, mutation, domain migration, send state and provider integration. Laravel has no mail-table, Storage administrative or Resend access. Its only database privilege is the isolated presentation-session store if PostgreSQL is selected for that store; it must not use Supabase service-role access.

Desktop mailbox sessions behave as isolated web sessions. Native assistant/native-mobile sessions use their own reviewed system-browser/PKCE enrollment and OS-protected credentials; no token is passed between views through URLs or JavaScript. Android/iOS are separate native clients of the same API. Mac and Windows have separate installers.

The diagram omits the TLS reverse proxy, backup destination and observability plumbing for clarity. The reverse proxy routes the web UI to Laravel and authenticated API/webhook paths to Rails; it does not weaken either application's authorization. See [architecture](architecture.md), [framework decision](decisions/0002-rails-laravel-presentation.md), [reuse playbook](component-reuse-playbook.md) and [cross-platform tests](cross-platform-testing.md).
