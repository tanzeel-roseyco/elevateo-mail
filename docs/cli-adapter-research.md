# Local CLI adapter research

Status: historical research checkpoint. A bounded Windows Claude companion has since been implemented; see [the bridge](local-ai-bridge.md) for current capability, fixture evidence and live-acceptance limits. The Codex tool-denial gap below remains open. This document does not certify a sandbox or a supported subscription-embedding arrangement.

## Decision

Do not connect the renderer to an unrestricted CLI. Claude provides a promising tools-disabled invocation, but managed hooks remain an explicit blocker on machines whose effective policy cannot be verified. For Codex, this research did not establish a supported switch combination that removes every tool, hook and inherited customization. A read-only sandbox still permits file reads.

The smallest next step is credential-free argument/environment builders and fixture tests. Actual launch must wait for the isolation checks below. Analytical tradeoff review was used; an Obsidian connection was unavailable.

## Evidence and supported controls

Read-only local inspection found Codex CLI **0.160.0** and Claude Code **2.1.289**. Only version/help commands were executed; no agent, login or credential inspection ran. These versions are the compatibility baseline, not a promise about future releases.

### Codex

Installed `codex exec --help` documents stdin input, `--output-schema`, JSON events, `--ephemeral`, `--ignore-user-config`, `--ignore-rules` and strict configuration checking. Ignoring user configuration still uses CODEX_HOME for authentication. Rules files are not the entire configuration system.

Official configuration documents expose individual shell, execution, app and hook controls. They do not establish the complete tools-disabled contract needed here. Disabling shell execution alone is insufficient evidence that file tools, MCP, apps or hooks cannot run. Managed hook locations also require consideration. A profile layered on existing configuration is not isolation.

Before implementing a production Codex adapter, pin a version and prove its complete effective tool/hook/configuration inventory, including managed settings; otherwise require an external isolation boundary and separately design credential access. Reject unsupported versions instead of guessing flags.

Sources: [CLI reference](https://developers.openai.com/codex/cli/reference), [configuration reference](https://developers.openai.com/codex/config-reference), [configuration layers](https://developers.openai.com/codex/config-basic).

### Claude

The official CLI reference documents tools removal, explicit-only MCP configuration, structured output and session-persistence controls. Safe mode skips ordinary customizations but retains managed policy. Restricted mode also retains managed settings. Bare mode is unsuitable for subscription login: installed help explicitly excludes OAuth/keychain authentication in that mode.

Candidate argument array, subject to a controlled fixture/integration validation of the combined flags:

```text
--print
--safe-mode
--restricted
--tools ""
--disallowedTools "*"
--strict-mcp-config
--mcp-config {"mcpServers":{}}
--disable-slash-commands
--settings {"disableAllHooks":true}
--permission-prompts none
--no-session-persistence
--output-format json
--json-schema <fixed application-owned draft schema>
```

This represents separate arguments, not shell text. Preserve the empty tools argument. Never interpolate email into arguments; write a bounded request to stdin. Allowed-tools settings are not a deny-all policy.

Source: [Claude CLI reference](https://code.claude.com/docs/en/cli-reference); the locally installed help independently confirmed these switches.

**Blocking exception:** disabling hooks in command-line settings cannot disable managed hooks. Only managed-level policy can do that. Safe mode also allows managed hooks and certain managed commands. On a machine with unknown effective managed policy, reject real execution. Do not bypass organisational policy or claim these flags prevent all command execution.

Source: [Claude hooks and disabling hooks](https://code.claude.com/docs/en/hooks).

## Account isolation and credentials last

Each local app account must explicitly bind to its own approved provider login/profile. A different working directory does not establish a different subscription identity. Never let a cloud user borrow the developer's CLI identity, copy CLI tokens into the application database, or forward tokens to the renderer.

Codex supports file/keyring authentication storage; changing CODEX_HOME alone does not prove isolation from the OS credential store. Claude can select API authentication when relevant environment variables are present. Build child environments from an explicit allowlist rather than inheriting API keys, custom provider endpoints or authentication helpers. Do not use Claude bare mode as an isolation shortcut when subscriptions are required.

At the final credentials stage, users complete the provider's own login. Verify the chosen authentication method and account binding without recording secrets. Subscription availability and permitted integration use still require checking for the actual account/product; technical login support is not blanket approval for redistribution.

Sources: [Codex authentication](https://developers.openai.com/codex/auth), [Claude authentication](https://code.claude.com/docs/en/authentication).

## Smallest implementation sequence

1. Add pure provider adapter builders under `bridge/adapters/`: fixed executable identity, version allowlist, argument arrays, fixed draft schema and environment allowlist. Initially return unavailable for any provider whose isolation preflight is unresolved.
2. Add fixture tests for empty arguments, unsupported versions, malformed/oversized output, unexpected tool events, and provider errors. Reject unexpected tool events even though detection alone cannot undo a tool's side effect.
3. Reuse the existing one-request bridge limits: 100,000 input bytes, 64,000 combined output bytes and 60 seconds. Keep stderr inside the same budget. Never log mail or raw provider output.
4. Bind invocation and result acceptance to authenticated account plus session generation. Logout, account changes and permission revocation cancel work and invalidate late results. Supply only explicitly selected, authorised context; treat email text as data.
5. Only after isolation is proven, connect the native process supervisor. Return subject/body for review; no sending, filesystem tools, arbitrary working directories or general renderer command interface. Explain which AI provider receives the selected mail.
6. Permit Claude fallback only for definite Codex unavailability after confirmed process-tree cleanup. Authentication failures, unknown exits, malformed output and cancellation must not silently transfer the request to another provider.

A Windows Job Object can bound a process tree and resources; it does not deny filesystem or network access. The existing native fixture is containment evidence, not a security sandbox. A stronger OS boundary would add platform-specific complexity and must still protect authentication material. For this project, rejecting an unverified CLI environment is cheaper and safer than pretending those unresolved controls exist.

## Completion gates

- Version-specific effective hooks/tools/configuration isolation is proven; unknown or managed policy fails closed.
- Provider account identity is explicitly bound to the local app account; no inherited secret environment is accepted.
- Real native cancellation, output bounds and process-tree termination are verified on each supported OS.
- Structured result validation and session-change tests pass before any renderer connection.
- Subscription login and a harmless draft are tested only at the credentials stage with the user's own account.

No live CLI adapter, native IPC, credential flow or provider request was implemented by this research.
