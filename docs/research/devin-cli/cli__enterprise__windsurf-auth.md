> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Legacy Windsurf Auth

> Authenticate to Devin CLI with your existing legacy Windsurf Enterprise account, including per-user CLI access requirements and billing.

## Overview

Enterprise users can authenticate to Devin CLI using their existing legacy Windsurf enterprise accounts. This provides a seamless experience for organizations already using Windsurf, with billing handled through the standard **Windsurf legacy credit model**.

User management, team organization, SSO, RBAC, billing, and consumption are all inherited natively through the Windsurf dashboard. For most of your organizational needs, you should rely on the [Windsurf dashboard](https://windsurf.com).

<Note>
  Legacy Windsurf authentication for Devin CLI is available to **legacy Windsurf Enterprise** customers. Contact your account executive if you have questions about authentication, billing, or access.
</Note>

## Getting Started

### Prerequisites

Before using legacy Windsurf authentication, ensure that:

1. Your organization has a legacy Windsurf enterprise account
2. You have an active legacy Windsurf user account that can use the agentic tools
3. Devin CLI access is enabled for your user

<Note>
  Being able to use Windsurf's agentic tools does not guarantee access to Devin CLI. CLI access is a separate per-user setting controlled by your admin: a user's individual setting takes precedence, and users without one follow your team's default CLI access policy, which may be disabled. If CLI access is disabled for you, `devin auth login` can still succeed, but Devin CLI requests fail with `CLI access is disabled for this user - ask your admin for access`.

  Admins can enable or disable CLI access for individual users with the SCIM `cliActive` attribute (see [SSO & SCIM](/desktop/accounts/sso-scim)) or, where available, with the **Disable CLI Access** toggle when editing a user in the [Team Members dashboard](https://windsurf.com/team/members).
</Note>

### Installation via Devin Desktop

Devin CLI is bundled with Devin Desktop. An admin must first enable the option in [Devin CLI Team Settings](https://windsurf.com/team/cli-settings) — see [Team Settings](/cli/enterprise/team-settings#show-install-devin-cli-in-the-devin-desktop-command-palette) for details.

Once enabled, open the Command Palette (<code>Cmd+Shift+P</code> / <code>Ctrl+Shift+P</code>) and run **Install Devin CLI**.

Alternatively, you can install using the standalone installer — see the [Quickstart](/cli/) for instructions.

### Authenticating

To authenticate with your legacy Windsurf enterprise account:

```bash theme={null}
devin auth login
```

Follow the prompts and be sure to select the **Log in with Windsurf for Enterprise** option to authenticate through your organization's identity provider.

### Credentials file location

After `devin auth login`, Devin CLI stores your API token in `credentials.toml`. By default, this token is persistent and does not expire. You can copy the credentials file between your own machines to reuse the same authentication, but treat it as sensitive: anyone with this file can authenticate as you. Do not share it or commit it to source control.

| Platform | Location |
| - | - |
| macOS / Linux | `$XDG_DATA_HOME/devin/credentials.toml` when `XDG_DATA_HOME` is set; otherwise `~/.local/share/devin/credentials.toml` |
| Windows | `%APPDATA%\devin\credentials.toml` (typically `C:\Users\<you>\AppData\Roaming\devin\credentials.toml`) |

Run `devin auth logout` to remove stored credentials.

## Billing & Analytics

Usage through Devin CLI is billed using the standard **Windsurf legacy credit model**. All Devin CLI usage counts toward your organization's existing legacy Windsurf enterprise allocation.

The analytics and billing systems are shared between Windsurf and Devin CLI. Use the [Team Members dashboard](https://windsurf.com/team/members) to manage team organization or view consumption metrics across both products.

<Note>
  On prompt-based plans, each subagent consumes additional credits, just like a user message does. The number of credits depends on the model the subagent uses, so tasks that spawn multiple subagents (or [nest](/cli/subagents#nesting-depth) them) consume more credits.
</Note>

Enterprise admins can also access usage analytics programmatically through the [Analytics API](/desktop/accounts/api-reference/api-introduction) to monitor consumption across their organization.

For details about credit billing and usage tracking, refer to your enterprise agreement or contact your account executive.

## Further Reading

For more information about legacy Windsurf enterprise features, see the [Devin Desktop documentation](/desktop/getting-started):

* [Guide for Admins](/desktop/guide-for-admins) — Administration and team management
* [SSO & SCIM](/desktop/accounts/sso-scim) — Single sign-on and user provisioning
* [API Reference](/desktop/accounts/api-reference/api-introduction) — Access analytics and usage data


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.