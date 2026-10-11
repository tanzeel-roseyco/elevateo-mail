> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Devin MCP

> Set up the official Devin MCP server so external AI tools can manage sessions, playbooks, knowledge, and repository docs.

The Devin MCP server provides programmatic access to Devin's platform capabilities for both private and public repositories. Beyond repository documentation and search, it gives any MCP-compatible AI agent or IDE full access to session management, playbooks, knowledge, and scheduling.

<Info>
  Any Devin session or MCP-compatible client can create sessions, manage playbooks and knowledge, set up schedules, and more. See [Advanced Capabilities](/work-with-devin/advanced-capabilities) for details on what Devin can do.
</Info>

## What is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io/introduction) (MCP) is an open standard that enables AI apps to securely connect to MCP-compatible data sources and tools. You can think of MCP like a USB-C port for AI applications — a standardized way to connect AI apps to different services.

## Devin MCP Server

The Devin MCP server is an authenticated service that provides access to both public and private repositories, plus full platform management capabilities.

**Base Server URL:** `https://mcp.devin.ai/`

### Authentication Required

To use the Devin MCP server, you need a Devin API key:

1. Sign up for a Devin account at [Devin.ai](https://devin.ai/)
2. Generate an API key from your [account settings](/api-reference/authentication)
3. Include the API key in your MCP client configuration

The MCP server supports the same authentication methods as the [Devin API](/api-reference/authentication):

| Token type | Prefix | Org resolution |
| - | - | - |
| **Org-scoped service user key** | `cog_` | Automatic — org\_id is resolved from the service user |
| **Enterprise service user key** | `cog_` | Requires `X-Org-Id` header (see below) |
| **Personal access token** | `cog_` | Requires `X-Org-Id` header (see below) |

<Note>
  Legacy API keys (`apk_` / `apk_user_` prefix) are **not supported** by the Devin MCP server. Use a [service user API key](/api-reference/authentication#service-users-recommended-for-automation) instead.
</Note>

#### Enterprise accounts: `X-Org-Id` header

Enterprise service user keys and PATs are scoped to the account level, not a specific organization. Since the MCP tools operate on organization-level resources (sessions, playbooks, knowledge, etc.), you must tell the server which organization to target by passing the `X-Org-Id` header:

```json theme={null}
{
  "mcpServers": {
    "devin": {
      "serverUrl": "https://mcp.devin.ai/mcp",
      "headers": {
        "Authorization": "Bearer <API_KEY>",
        "X-Org-Id": "<YOUR_ORG_ID>"
      }
    }
  }
}
```

<Tip>
  Find your organization ID at the top of the **Settings > Devin API** page.
</Tip>

Org-scoped service user keys do not need this header — the organization is resolved automatically.

## Available Tools

### Repository Documentation

These tools let you explore and query documentation for any GitHub repository (public or private with authentication):

| Tool | Description |
| - | - |
| **`read_wiki_structure`** | Get a list of documentation topics for a GitHub repository |
| **`read_wiki_contents`** | View full documentation about a GitHub repository |
| **`ask_question`** | Ask any question about one or more repositories (up to 10) and get an AI-powered, context-grounded response |
| **`list_available_repos`** | List all repositories available to query with your Devin account |

### Session Management

Create, search, inspect, and control Devin sessions programmatically:

| Tool | Description |
| - | - |
| **`devin_session_create`** | Create one or more Devin sessions. Each session can have a prompt, title, playbook, tags, and ACU limit |
| **`devin_session_search`** | Search and filter sessions by tags, playbook, origin, schedule, user, or creation/update time |
| **`devin_session_interact`** | Interact with a session — get status, send messages, sleep, terminate, archive, read messages and attachments, or manage tags |
| **`devin_session_events`** | Inspect events within a session — list summaries, fetch full event details, or search event contents by text |
| **`devin_session_gather`** | Wait for multiple sessions to reach a settled state (finished, errored, sleeping, or waiting) before returning. Useful after creating parallel sessions instead of polling in a loop |

### Playbook Management

Create and manage playbooks that standardize how Devin performs tasks:

| Tool | Description |
| - | - |
| **`devin_playbook_manage`** | List, get, create, update, or delete playbooks. Supports automation macros (e.g. `!my_macro`) |

### Knowledge Management

Maintain your organization's knowledge base that Devin uses for context:

| Tool | Description |
| - | - |
| **`devin_knowledge_manage`** | Full CRUD for knowledge notes — list, get, create, update, delete, browse folder structure. Also manage knowledge suggestions — list, view, and dismiss pending suggestions. Supports filtering by repo, folder, and search queries |

### Schedule Management

Set up recurring or one-time scheduled Devin sessions:

| Tool | Description |
| - | - |
| **`devin_schedule_manage`** | List, get, create, update, or delete schedules. Supports cron expressions for recurring schedules, one-time scheduling, notification preferences, and agent selection |

### Integration Management

View and manage your organization's native integrations and MCP servers:

| Tool | Description |
| - | - |
| **`devin_list_integrations`** | List all native integrations (e.g. GitHub, Jira, Slack) and MCP servers with their install status and settings URLs. Filter by installed, not installed, or all (the legacy name `list_integrations` is still accepted) |

## Wire Protocols

The Devin MCP server supports Streamable HTTP:

* **URL:** `https://mcp.devin.ai/mcp`
* Works with HTTP-compatible clients
* **Recommended for all integrations**

<Note>The legacy SSE (`/sse`) endpoint has been deprecated. Use the `/mcp` endpoint instead.</Note>

## Key Differences from DeepWiki MCP

| Feature | DeepWiki MCP | Devin MCP |
| - | - | - |
| **Authentication** | None required | API key required |
| **Repository Access** | Public repositories only | Public and private repositories |
| **Platform Management** | Not available | Sessions, playbooks, knowledge, schedules, integrations |
| **Base URL** | `https://mcp.deepwiki.com/` | `https://mcp.devin.ai/` |
| **Cost** | Free | Requires Devin account |

## Setup Instructions

The field name for the server URL depends on the client: Devin Desktop uses `serverUrl`, while most other clients use the standard `url` field. Using the wrong field name causes the MCP server to be silently ignored.

### For Devin Desktop:

```json theme={null}
{
  "mcpServers": {
    "devin": {
      "serverUrl": "https://mcp.devin.ai/mcp",
      "headers": {
        "Authorization": "Bearer <API_KEY>"
      }
    }
  }
}
```

### For most other clients (e.g. Cursor):

```json theme={null}
{
  "mcpServers": {
    "devin": {
      "url": "https://mcp.devin.ai/mcp",
      "headers": {
        "Authorization": "Bearer <API_KEY>"
      }
    }
  }
}
```

### For Claude Code:

```bash theme={null}
claude mcp add -s user -t http devin https://mcp.devin.ai/mcp -H "Authorization: Bearer <API_KEY>"
```

## Related Resources

* **[Advanced Capabilities](/work-with-devin/advanced-capabilities)** — Overview of Devin's advanced features
* **[Devin's MCP Marketplace](/work-with-devin/mcp)**
* **[Connecting remote MCP servers to Claude](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp)**
* **[OpenAI's docs for using MCP servers](https://platform.openai.com/docs/guides/tools-remote-mcp)**
* **[DeepWiki MCP](/work-with-devin/deepwiki-mcp)** — For public repositories only
* **[DeepWiki](/work-with-devin/deepwiki)**
* **[Ask Devin](/work-with-devin/ask-devin)**


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.