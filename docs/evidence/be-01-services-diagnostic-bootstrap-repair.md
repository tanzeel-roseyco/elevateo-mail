# Diagnostic delivery bootstrap repair — local freeze

Preparation only. No SSH, Docker, allocation, installation, or test execution occurred for this repair. The consumed R2 attempt remains NOT_RUN; its original blank reconciliation transport status remains UNKNOWN. A subsequent independent native SSH read confirmed remote reconciliation exit0. The retained configuration volume and shared bases remain preserved. See [R2 evidence](be-01-services-diagnostic-r2-result.md).

The original nested Windows SSH `bash -c` command exited1 before delivery creation; original stderr was not separately captured. Quoting is a suspected cause, not a proven remote argv trace. Original artifacts and all frozen diagnostic dispatcher/checks/reconcile/fixture files remain unchanged.

## Frozen local files

Paths relative to `docs/evidence/repairs/be01-diagnostic-bootstrap/`. LF UTF-8 without BOM.

| File | LOC | SHA256 |
| --- | ---: | --- |
| bootstrap.sh | 16 | 3ab389aa8f6d022afa3ea531d031b2912d3c0a8911b66ac761df5a4121424db3 |
| bootstrap.ps1 | 80 | 0dd7ddede090bb85eaaf6e5b94de1d3ed12011ea288787061384cbefe406484d |
| invoke-r3.sh | 73 | b5d10a69efe0df3bb9ab8cd62db42b1ad5fe22a33aa4c30b539bf0ebceffc079 |
| review.sha256 | 3 entries | 25eec650e45a8f4a553dba981f88cda2cb402db5b66dad129b3ad018ad4ba0a2 |

169 executable LOC awaiting coordinator bounded re-review: caller/bootstrap96 and invocation73 (only three UUID references differ from reviewed R2). No new static PASS or runtime PASS claimed.

## Proposed invocation, not execution authorization

From this checkout, after independent authentication of the manifest and caller:

```powershell
powershell.exe -NoProfile -File 'docs/evidence/repairs/be01-diagnostic-bootstrap/bootstrap.ps1' -EvidenceDirectory 'C:/Users/Tanzeel/AppData/Local/Temp/be01diagnostic-bootstrap-30b0dcb8-3dcf-4d44-9e63-7a475256806a'
$callerExit = $LASTEXITCODE
```

Caller authenticates literal bootstrap bytes and writes them directly to native SSH stdin. Fixed remote command is `timeout -k 5s 45s bash -s`; no nested `bash -c`, interpolated shell body, or generator. Fresh proposed delivery is `/tmp/be01diagnostic-delivery-30b0dcb8-3dcf-4d44-9e63-7a475256806a`; audit is `/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01diagnostic-30b0dcb8-3dcf-4d44-9e63-7a475256806a`. Both must be absent including dangling links. Bootstrap checks hostname, user, Docker environment and default socket before creating only the delivery0700. No ancestor chmod.

After separately allocated successful bootstrap, the unchanged eleven-member archive SHA1b2631a11e91e231399b71e18ac9a0fbcb783204bfcf6cd209f2b33a8978cf87 and proposed invocation must be uploaded/authenticated before invocation. invoke-r3 preserves all R2 capacity/conflict/canonical/nested source/image/strict historical-object versus exact-one-array retained-volume identity/consumer gates. No gate is bypassed by bootstrap success. No workload execution is authorized here.

## Exit and cleanup behavior

Native SSH exit is captured directly from Process.ExitCode immediately after successful wait. Caller records native.status and caller.status separately from stdout.log and stderr.log. Original exception remains primary; nonzero native status is not replaced by log failure. Successful SSH plus cleanup/evidence failure returns nonzero. Timeout returns124 even when termination yields a native nonzero; that native status is preserved IN EVIDENCE, not used as the timeout caller exit.

The caller waits75s after writing its small fixed input; `finally` kills only its exact SSH Process if still live and waits at most10s on every post-start path, including stdin/output exceptions. Dispose occurs afterward. Kill/wait failure is explicit cleanup uncertainty, never success. This is not a hard whole-caller deadline on synchronous stdin/file operations. After process cleanup, both output tasks share one five-second monotonic drain deadline (10ms polling; no per-stream budget reset). This allows asynchronous pipe draining after native process exit. Only completed tasks reach GetResult; incomplete/failed output is recorded as evidence failure. Timeout does not replace an original exception or nonzero native exit; an otherwise successful process fails closed on incomplete evidence. Status write failure is reported on stderr and cannot turn a failed attempt into success. Forced external termination cannot guarantee finally execution.

Missing status, timeout, termination uncertainty or partially created delivery requires independent read-only remote inventory and identity reconciliation; never retry or remove unknown resources automatically. This packet performs no Docker cleanup or retained-volume access.

## Docker-only regression proposal

No host tests. Review a small fixture before execution in the previously reviewed immutable Lane P PowerShell tools recipe (availability must be freshly checked; do not assume its cleaned image exists). Ruby-only base cannot execute this PowerShell caller. A separately authorized build would be required if the reviewed pwsh image is absent; no downloads/builds authorized here.

Use one socket-free container: UID10001, network none, read-only root/source bind, bounded writable tmpfs, cap-drop ALL, no-new-privileges, pids128,0.5CPU/256MiB, outer180+10 watchdog. A fake executable named ssh.exe records exact argv and stdin bytes, with no network or Docker socket. Exercise the actual caller:

1. Exact fixed argv, no `-c`, byte-identical LF stdin and SHA; native0 with distinct stdout/stderr markers.
2. Native37 propagates unchanged; stderr never merged into stdout. Early stdin-close failure retains original exception and records eventual native exit.
3. Inject failure after Process.Start while fake SSH stays live; require exact process terminated/reaped and caller nonzero. Simulate output/status write failures without replacing original nonzero native status.
4. Timeout path records124 and native termination status separately; inherited/unclosed pipes cannot cause unbounded output wait. Missing status is UNKNOWN.
5. Run literal shell through stdin with stub hostname/id/docker/stat and isolated paths: existing/dangling delivery or audit rejected before mkdir; wrong host/user/socket rejected; successful new directory mode0700. Test-only path adaptation must not alter runtime frozen files.

Container fixtures prove script/argv/status handling under Linux pwsh, not Windows native OpenSSH quoting or real fleet identity. Actual Windows-to-fleet transport remains pending separate allocation. Capture container ID before start; remove only exact profile/label/mount-proven disposable container and independently prove ID/name/label absence. Preserve retained config and all shared resources. No full-services retry belongs to this regression.

## Review finding and additional regression proposal

Independent review of the original caller73 + shell16: 89 unique LOC, one MED,11.24 defects/KLOC. The reported ab35f15c prefix identifies the prior manifest, not the PS1; reviewed PS1 was04557d42. Immediate IsCompleted after process exit could race asynchronous pipe EOF, discard successful output and falsely fail. Local repair adds a shared five-second drain deadline. Finding resolution awaits re-review and Docker validation; no runtime claim.

Add deterministic Docker-contained race fixtures: fake ssh.exe exits0 while a short-lived child inherits stdout/stderr and emits distinct trailing markers after native parent exit; require complete separate logs and caller0 once both streams close within the shared deadline. Repeat with native37 and require37 plus full logs. Hold both pipes beyond five seconds, with one closing near the deadline: verify the budget is shared (not another five seconds per stream), caller fails closed, native0/37 remains recorded, and37 remains the caller exit when originally nonzero. Container timeout/cleanup contains all stub descendants. An original post-start exception must remain primary even when drain times out. These are proposed tests, NOT_RUN; Linux pwsh fixtures do not prove Windows native SSH transport.

Static closure received: functional re-review80 LOC and dedicated design96 LOC overlapping, zero new defects at frozen caller0dd7dded/shell3ab389aa. Prior drain MED closed statically; runtime remains NOT_RUN. Implemented Docker fixture and image prerequisites are in be-01-services-diagnostic-bootstrap-fixture.md; no longer proposal-only.
