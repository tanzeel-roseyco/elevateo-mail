# Native agent bridge

Standalone Rust library for the native-only `contracts/v2/completion.openapi.json`
protocol. This crate deliberately does not register desktop UI commands. The native
integrator must maintain one `Bridge`, derive the owner UUID from its authenticated
session (never request JSON), implement `GrantResolver` against the authenticated
backend, and map `Error::code()` into the common error envelope. `start`, `events`
and `cancel` are the integration API. Poll `events(owner, run_id, last_sequence)`
and forward those events to the owning window only. Cancel active runs on logout.

`GrantResolver` must resolve the requested grant for that owner and return its token
from trusted secure storage, plus the chosen runtime's provider key. The mailbox
MCP service validates the grant and source session on every request; revocation
therefore denies the next mailbox operation even during an already-running model
conversation. Email content cannot modify the fixed CLI arguments, MCP URL,
tool allowlist, egress policy, process policy or grant. Search/read/draft responses
already carry canonical message citations; the bridge forwards assistant text and
does not manufacture citations or grant wider rights. A provider's prose can omit
citations; callers must display tool-backed message citations separately when needed.

## Isolation and lifecycle

Every run uses an immutable local Docker image ID (`sha256:...`) or repository
digest, an explicitly local daemon socket, a read-only unprivileged container with
no host mounts, bounded tmpfs, CPU/memory/process limits, and its own internal
network. A separate ephemeral CONNECT proxy allows only the selected provider
(`api.openai.com` or `api.anthropic.com`) and the configured public HTTPS MCP host,
on port 443. DNS results must all be public, and the checked IP is connected directly.
No ports are published. No Google endpoints are allowed. Docker Desktop must use
Linux containers. Docker/image absence fails closed; there is no host CLI fallback.

The trusted image runs pinned Codex 0.165.0 and Claude Code 2.1.312. Claude built-in
tools are empty and only granted MCP tools are preapproved. Codex shell tools are
disabled, its sandbox is read-only and web search is disabled. Container isolation
remains the final boundary even if a CLI changes its tool behavior. The proxy is a
host allowlist, not an HTTPS path filter; provider API credentials should be scoped
to model usage. Neither runtime receives the user's home, repository, SSH keys or
Docker socket. Secrets enter the launcher on stdin, never Docker argv or container
environment metadata. CLI stderr and Docker logging are disabled; only assistant
text is emitted, with exact credential strings redacted.

There are at most two active runs, 300 seconds per CLI, 1 MiB of output and 256 output
events plus one terminal event. The most recent 32 completed runs remain available;
older cursors return `not_available`. Cancellation is owner-bound and is idempotent
for a retained cancelled run. It reports success only after whole-container removal
is verified. Cleanup failure produces `failed` and quarantines capacity instead of
claiming the process stopped. The launcher deadline survives a native-process crash;
the proxy exits after six minutes. A host crash can leave stopped task-labeled
containers/networks for operator removal, but never a persistent model process.

## Final Docker verification and runtime image

Build only at the root task's final local Docker gate. Supply digest-pinned
Debian-based Rust and Node 22+ base images, plus a pinned Docker CLI image:

```sh
docker build --build-arg RUST_IMAGE="$RUST_IMAGE" --build-arg DOCKER_IMAGE="$DOCKER_IMAGE" -f Dockerfile.check -t elevateo-agent-check .
docker run --rm --network none elevateo-agent-check
docker build --build-arg NODE_IMAGE="$NODE_IMAGE" -f Dockerfile.runtime -t elevateo-agent-runtime .
docker image inspect elevateo-agent-runtime --format '{{.Id}}'
```

The check image runs eight Rust unit/lifecycle tests and fifteen Python policy and execution tests;
one real-container integration test is explicitly ignored by the offline default.
Fake Docker tests cover completion, denied grants, startup failure, ownership,
capacity, cancellation, timeout and floods. They do not establish real Docker or
paid-provider CLI compatibility. Runtime image smoke checks may execute `--version`
and `--help` without credentials; live model calls are excluded. The root Docker
gate must separately prove container isolation and tree removal with `Dockerfile.fixture`
(digest-pinned `PYTHON_IMAGE`) and `cargo test --test docker_lifecycle -- --ignored`.
Set `NATIVE_TEST_DOCKER` to an absolute local Docker executable and `NATIVE_TEST_IMAGE`
to the fixture image ID inside the trusted check container, with the local Docker
socket mounted for this harness only. No provider image or credentials are needed.
The test verifies completion, cancellation of a live descendant process and timeout;
the bridge verifies whole-container removal before terminal success. Preserve any required
runtime image before the mandated image/cache cleanup, or rebuild it afterward.

Official CLI enforcement references:

- [Codex configuration](https://developers.openai.com/codex/config-reference)
- [Codex non-interactive authentication](https://developers.openai.com/codex/noninteractive)
- [Claude CLI flags](https://code.claude.com/docs/en/cli-reference)

Dependencies: Tokio provides cancellable process supervision; Serde/serde_json and
UUID enforce the wire types; URL validates the trusted MCP origin. Dependency
versions are exact-pinned in Cargo.toml, with Cargo.lock retained from the final local
Docker gate. That gate passed eight Rust tests, fifteen Python tests and the real
Docker lifecycle test (completion, cancellation and timeout); no provider requests
were made. Locked builds and test runs enforce the retained dependency resolution.
