# Mailbox MCP service

This service implements MCP 2025-11-25 JSON responses over Streamable HTTP (`/mcp`) and newline-delimited stdio. Only `mailbox_search`, `mailbox_read` and `mailbox_draft` exist. Drafting never sends. The Rails backend owns grant issuance, revocation and mailbox authorization. Every tool invocation forwards its grant and revalidates the canonical completion contract. Emails are untrusted data; tool lists, paths, credentials and permissions never derive from them.

Set `ELEVATEO_MCP_BACKEND_ORIGIN` to the HTTPS API origin (or `http://launch-api:3000` inside the private Compose network), and `ELEVATEO_MCP_HTTP_HOST` to the exact incoming Host header for HTTP. Browser Origin headers are rejected. Supply the user's grant in `Authorization: Bearer ...`. Stdio uses `ELEVATEO_MCP_GRANT` and runs `node dist/src/stdio.js`; never put grants in command arguments or a checked-in client configuration.

The service has no database credentials, mail transport, filesystem tool or shell tool. Tool failures redact upstream details. A 256 KiB request limit, 4 MiB upstream response limit, eight-second upstream deadline and bounded HTTP concurrency protect memory and resource usage. Contract and service integration tests run only in the final Docker gate.

Protocol sources: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports and https://modelcontextprotocol.io/specification/2025-11-25/server/tools.
