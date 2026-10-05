# Local AI draft bridge: credential-free core

`bridge/runner.ts` is an isolated draft-only state machine, tested with an injected fake process supervisor. It is not connected to the application, a CLI, a local HTTP listener or a desktop host. No credentials are needed for these tests.

The trusted host binds an opaque authenticated account ID and a session generation, obtains authorised selected-mailbox context from the backend, and submits a draft request. Mail is explicitly untrusted data. The result contains subject/body only; it cannot send, choose tools, execute commands or save a server draft. Saving would require the normal authenticated, authorised backend endpoint and human review.

Limits: one active request, no queue, 100,000 UTF-8 input bytes including JSON, 64,000 output bytes, and a 60-second work deadline. Logout, account change, permission change or cancellation must call `bind`/`cancel`; any rebind cancels current work. Host generations must be monotonic and checked against the authenticated session, not accepted from arbitrary web content. The bridge is not itself an authentication service.

Codex is first. Claude is attempted only after the supervisor reports definite provider unavailability and confirms the entire prior process tree stopped. Unknown exits, cancellation, output errors and timeouts never trigger fallback. Every exit requires tree cleanup. Failed cleanup or ambiguous startup permanently disables that runner instance. If cleanup hangs, the instance remains busy; the host must not replace it or launch another runner until OS-level termination is independently confirmed.

## Historical core milestone: gaps at that stage

- A native supervisor with verified executable paths, argument arrays (no shell interpolation), isolated working directory, bounded startup/cleanup, captured stderr within the same byte budget, and trustworthy exit classification.
- Verified provider-specific CLI adapters, supported versions and structured output conversion. No guessed flags or real CLI launch is implemented here.
- An OS-enforced process-tree containment and resource policy. JavaScript deadlines are not CPU/RAM limits or a sandbox. Windows/macOS implementations and failure tests remain unresolved.
- Verified denial of filesystem tools, network tools, hooks, MCP and arbitrary commands from mail context. CLI configuration inheritance and provider authentication need explicit native handling.
- Authenticated desktop IPC, per-user permission checks, cancellation on session expiry/revocation, and applicable Google data-use approval before transmitting real mail to either provider.

Docker validation: run the backend's `tsx --test ../bridge/runner.test.ts` and TypeScript with `tsc -p bridge/tsconfig.json` from the repository root, resolving the existing installed tooling. Parent integration owns exact container commands. No native resource or visual acceptance evidence is claimed by fake-supervisor tests.

## Native containment decision

A Node-only launcher cannot implement the supervisor contract. A root process exit does not establish that descendants have stopped. On Windows the native host must create the child suspended, assign a non-breakaway Job Object before resuming, terminate the job on cancellation, and confirm its active process count reaches zero before reuse or fallback. A Job Object provides process/resource containment, not a complete security sandbox. macOS requires its own verified implementation; Windows behavior must not be assumed there.

Do not replace this with `taskkill /T` after the parent exits or treat Node's `close` event as tree cleanup. Keep desktop IPC disabled until native tests establish containment, account separation, cancellation, and resource limits. Codex read-only mode still permits file reads; tool denial and inherited configuration must be verified separately for each supported CLI version.

References: [Node child processes](https://nodejs.org/api/child_process.html), [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects), [Claude CLI](https://code.claude.com/docs/en/cli-reference).

## Windows fixture containment harness (native fixture validated)

`src-tauri/src/bridge/windows.rs` began as a Windows-only fixture harness. The current opt-in companion reuses its containment primitive; the offline desktop host still does not import it. The fixture binary is gated behind the non-default `containment-fixtures` Cargo feature; normal preview builds do not include it.

The basic harness creates a suspended fixture process with no inherited handles or environment; its bounded I/O extension explicitly inherits only three approved standard handles. It assigns it to a non-breakaway Job Object before resuming, and configures a four-process limit, 128 MiB job-memory limit and 10% CPU hard cap. Explicit stop terminates the job and polls for zero active processes with a five-second deadline. Closing the owned job handle also requests process-tree termination. Only explicit successful `stop` confirms cleanup; dropping a handle is not evidence of completion.

Tests cover a hanging root, normal exit, a root that exits while its descendant remains, and a missing executable. On a prepared Windows build host: `cargo test --manifest-path src-tauri/Cargo.toml --features containment-fixtures --test bridge_windows`. Windows kernel behavior requires a Windows native environment: Linux Docker cannot validate Job Objects. This is a justified native-only test exception, not permission to move ordinary application tests out of Docker.

The exact harness and tests were cross-compiled in an isolated Rust 1.85 Docker crate (Windows GNU target, without Tauri) and the resulting harmless executables ran on Windows: four tests passed. Evidence is in `output/takeover/native/windows-tests.log`; earlier failed runs are retained. The descendant test initially assumed exactly one remaining process, but Windows reported two after the root signalled; the corrected assertion requires a live tree and then exactly zero after explicit termination. No assumption about console helper counts is needed. The test proves root exit does not imply an empty job; it does not separately identify the spawned descendant PID, so it is not independent proof of that specific process surviving. This validates fixture containment only, not the full Tauri build or an installer. Memory/CPU limits are configured but their enforcement is not yet measured. Forced API-failure cleanup, process-limit enforcement, drop cleanup and resource-pressure fixtures still need native coverage. The fixture always ends itself within 30 seconds if containment is unexpectedly ineffective.

The basic containment tests alone do not establish I/O correctness. The fixture harness does not accept mail, bind accounts, invoke Codex/Claude, authenticate, implement IPC, isolate the working directory, enforce filesystem/network restrictions or implement macOS containment. It deliberately inherits no credentials. A verified production adapter still needs the bounded input/output/deadline and poisoned-supervisor contract above. `windows-sys = 0.59.0` is a pinned Windows platform dependency providing platform API bindings; it does not add a runtime service or shell plugin. The isolated fixture build generated its own lockfile. Separately, `src-tauri/Cargo.lock` now locks the full project: Rust 1.90.0 in Debian Bookworm Docker compiled and linked the full Tauri crate with generated offline assets, and both navigation tests passed (`cargo test --locked --bin elevateo-mail-preview`). See `docs/desktop.md` and `output/takeover/tauri-native-check.log`. This does not validate Windows/macOS installers, native visuals or a real CLI/IPC adapter. Task containers used `--rm`; the downloaded Rust image and 30 MiB remote target directory were removed. The existing shared Node image, source files and local validation executables/logs were retained. Remote host free space increased by approximately 2.14 GB during cleanup, but concurrent work means this is not an exclusive attribution; no Docker/WSL disk compaction was needed on that Linux host.



## CLI preparation fixtures

`bridge/cliAdapter.ts` prepares a version-pinned Claude argument array and bounded stdin from validated draft context. It always returns `launchEnabled: false`; it is not wired to the supervisor. Unknown policy, account identity, version or changed session is rejected. Codex preparation remains blocked because complete tool/hook isolation has not been established.

The returned environment is empty rather than inherited. This is a preparation fixture, not a working subscription authentication environment: a future native adapter must establish identity and required environment explicitly. Caller-supplied policy/account strings are not security attestations and must never become launch authority or renderer-controlled permissions.

Output parsing accepts a conservative fixture result envelope containing a strict subject/body draft, checks the UTF-8 byte limit before parsing and rejects unknown fields and tool events. Actual CLI metadata compatibility remains unverified; rejecting unknown metadata is intentional. No real CLI output was generated. The eventual supervisor must enforce the same combined stdout/stderr budget while reading, before this parser runs.

See [CLI adapter research](cli-adapter-research.md) for official references, managed-hook blockers, subscription isolation and the required native validation gates. These pure fixtures do not close those gates or enable a real provider.

## Bounded Windows fixture I/O

`src-tauri/src/bridge/io.rs` adds fixture-only input/output supervision: one mutable runner, 100,000 input bytes, 64,000 combined stdout/stderr bytes, strict UTF-8, cancellation and a maximum 60-second deadline. Only three explicit standard handles are inherited. Reads alternate between streams, and successful root exit still terminates the job before draining remaining output. Ambiguous startup or failed cleanup permanently poisons the runner.

Input is staged in an exclusive, create-new, delete-on-close fixture file so a child that never reads cannot block a writer thread. This is harmless fixture transport, not approved storage for actual email. Production transport must choose and verify its own privacy boundary. No real CLI, credentials, native IPC or renderer command is enabled.

The exact current files were cross-compiled in a standalone Rust 1.85 Windows-GNU crate inside Docker, then all nine tests passed on Windows (2.40 seconds). Native execution is necessary to exercise Windows Job Objects and pipes. Coverage includes combined output overflow, malformed UTF-8, stalled input, descendant-held output, cancellation, reuse and poisoned startup. Evidence: `output/takeover/native-io/windows-tests.log`. This does not validate a full desktop build, installer, resource-pressure enforcement or a security sandbox.

Cleanup removed the task Rust image, disposable container and 33 MiB remote build target. Root-owned build files were removed through a one-off container mounted only at that target; the shared backend image was retained. Local executables, test logs and source snapshots remain. Remote free space increased approximately 2.2 GB during cleanup; concurrent host activity prevents exact attribution. No global prune or volume deletion ran.

## Current Windows draft companion (implemented; acceptance pending)

`elevateo-draft.exe` is a separate console companion, not a renderer shell API. The web assistant issues a one-use 60-second handoff for an authenticated account and selected mailbox. Paste that JSON into the companion. It redeems against a locally pinned HTTPS origin, checks the returned account against local setup, runs fixed Claude arguments, then rechecks the live session and read/draft permissions before printing a strict draft JSON. Copy that result back for review. It cannot send mail. The offline Tauri window remains an offline preview; this handoff avoids pretending it has browser authentication.

The native path currently supports only the locally pinned Claude Code **2.1.289** executable. Codex remains unavailable until its fixed adapter is verified. There is no automatic fallback. The earlier TypeScript adapter remains a disabled preparation fixture and is not launch authority.

Local setup is `%LOCALAPPDATA%/ElevateoMail/native-cli.json`, created explicitly by the local user after reviewing this boundary:

```json
{
  "trustInstalledCliAndAdminPolicy": true,
  "origin": "https://your-mail-app.example",
  "accountId": "your-opaque-app-account-id",
  "executable": "C:\\Users\\you\\path\\claude.exe",
  "sha256": "replace-with-64-lowercase-hex-digits-from-the-installed-file",
  "claudeConfigDir": "C:\\Users\\you\\.claude"
}
```

Use the application account ID returned by `/v1/me`; the directory is the user's existing Claude subscription profile. This does not prove the Claude subscription identity equals the application identity. The explicit local configuration chooses that association; neither mail nor the browser supplies it. No subscription credentials are stored in this file. The executable hash is checked with the file locked against ordinary replacement/writes and version output must match exactly. Updating Claude requires reviewing and changing the pin. No CLI login or real generation has been performed during development.

**This is process containment, not an OS security sandbox.** Installed Claude and administrator-managed policy are trusted local software. Fixed flags disable generation tools, MCP, slash commands, normal setting sources and session persistence; managed hooks can still have the authority of trusted machine policy. The opt-in is acknowledgement of that trust, not evidence that managed policy is absent. Do not use this configuration if the local installation or its administrator policy is untrusted. Official references: [Claude CLI](https://code.claude.com/docs/en/cli-reference), [managed settings](https://code.claude.com/docs/en/managed-settings), [hooks](https://code.claude.com/docs/en/hooks).

The child starts suspended, enters a non-breakaway Job Object, then resumes. Limits are one active companion per local setup directory, four processes, 512 MiB job memory, 10% CPU, 100,000 stdin bytes and 64,000 combined stdout/stderr bytes. Generation has at most 45 seconds and reserves time for the final lease check. Input uses anonymous pipes, not a mail staging file. The environment inherits only Windows profile/temp locations plus the explicitly selected Claude profile; API keys, proxies, PATH and Node/CLI overrides are excluded. A unique empty working directory is removed only if still empty. Unexpected files are retained for inspection, never recursively deleted.

Session revocation while generation is running prevents result release at the final check; it does not retract mail already transmitted to the trusted provider. Ctrl+C exits the companion and closes its kill-on-close job; explicit successful execution also verifies zero active child processes. There is no background daemon, localhost listener, automatic restart or paid API fallback.

Remaining acceptance: own-account Claude login and one live draft, managed-policy compatibility, observed resource-pressure enforcement, packaged Windows distribution and visual handoff QA. macOS has no implemented equivalent yet. These are real remaining gates; fixture tests are not proof that a subscription call succeeds.

Validation of this companion slice: five protocol/flag tests passed inside Rust 1.90 Docker. The exact native files and console binary cross-compiled for Windows GNU in an isolated crate; twelve harmless fixture tests then passed on Windows in 2.47 seconds. The native exception is necessary for Job Object and pipe semantics. New coverage exercises empty/quoted/backslash/shell-character argv, anonymous stdin, stalled readers and combined output limits. Logs and binaries are retained in `output/takeover/native-companion/`. This is not a full current Tauri build, installed Claude invocation or real HTTPS ticket-to-draft acceptance test.

Cleanup removed the exact companion image, disposable containers and 1.3 GiB build target. The shared backend image and other tasks were retained. Exact build-cache ID pruning reclaimed 0 B; cache records still referenced by shared storage were retained rather than globally pruned. Remote host free space moved from approximately 252 to 254 GiB, which includes concurrent activity. No local Docker/WSL disk was used, so Windows disk compaction was not applicable. Source snapshots, local executables and evidence remain.

### Codex primary runner: verified capability gap

The installed `codex-cli 0.160.0` was inspected with version/help/features commands only. `exec` supports stdin, JSON events, output schema, ephemeral runs, ignoring user configuration/rules and strict configuration. It does not expose a global no-tools argument. Current official configuration documents individual shell/image/MCP/connector switches, not a verified blanket exclusion of every builtin. `read-only` protects against certain writes; it does not prohibit reading unrelated local files. Approval policy `never` means no escalation, not no tool execution.

Consequently the native runner does not silently substitute Codex with an unverified feature denylist. This is an implementation/capability gap, not a missing API key. The smallest next gate is a version-pinned, authoritative complete tool inventory and demonstrated deny-all configuration for that exact binary (including patch, browser, skills, plugins and dynamically supplied tools), or a supported pre-execution interception boundary that rejects every tool. App-server item notifications alone do not establish interception before execution. Once that gate exists, reuse the implemented executable pin, ticket/lease binding, bounded process and strict draft parser; no new service or model-provider API is needed. A read-only sandbox or a prompt saying “do not use tools” is not acceptance evidence.

References: [official CLI reference](https://developers.openai.com/codex/cli/reference), [configuration reference](https://developers.openai.com/codex/config-reference), [app-server protocol](https://developers.openai.com/codex/app-server), [OpenAI's current configuration schema](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json). The moving main-branch schema is supporting evidence, not proof of the installed binary's complete tool behavior. No real Codex model request, authentication or credential read was performed.
