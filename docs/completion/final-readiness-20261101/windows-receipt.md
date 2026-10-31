# Windows verification — 2026-11-01

All automated execution used DOCKER_CONTEXT=desktop-linux. No fleet or production actions.

Commands, from repository root:

```powershell
$env:DOCKER_CONTEXT='desktop-linux'
docker build -f apps/windows/build/Dockerfile -t elevateo-windows-p27-p34:toolchain .
docker build -f apps/windows/build/verification.Dockerfile -t elevateo-windows-p27-p34:verify .
```

The verification image was patched with the three compile repairs using docker cp, then the
mounted [windows-gate.sh](windows-gate.sh) ran in a network-disabled container limited to
1400 MB and one CPU. Exact commands are in that script. Final log:
[windows-final-gate-retry2.log](windows-final-gate-retry2.log).

- Release build/typecheck and recommended .NET analyzers: 0 warnings, 0 errors.
- Unit/loopback/view tests: 93 passed, 0 failed, 0 skipped. Packaging reran the same 93 successfully.
- Installer regressions: 7 passed; fresh publish excludes stale files; enumeration errors fail closed.
- Self-contained win-x64 publish and NSIS: success, unsigned (no signing credentials).
- Installer size: 31,456,436 bytes; SHA-256 in windows-installer-sha256.txt.
- Inspected actual Avalonia/Skia renders: screenshots/windows-960.png and windows-1280.png.
  Reader/composer remain visible; assistant hides at 960 and appears at 1280; simulation is labelled.
- Native executable launched on Windows; accessibility tree showed Elevateo sign-in. The computer-use
  provider returned overlapping-app pixels despite a correct target tree; discarded captures are not evidence.
  Native interactive authentication and installer installation/uninstallation are not claimed.

Initial failures are retained: nullable argument CS8604, incorrect SignInFailure assertion and
CA1861 constant-array assertion. Final build fixes use the validated local error, Failure.Reason,
and Assert.Collection. A PowerShell logger quoting failure was replaced with the mounted script.

Cleanup: inspected task-container bind mounts, removed both task containers, then ran
`docker builder prune -a -f` (2.279 GB reported) and `docker image prune -a -f` (2.807 GB reported).
Other workers' running containers and all volumes were retained. Rust base is reserved for the next gate.
Host C: free space after cleanup: 33,395,806,208 bytes. Reported Docker reclamation is not host VHD
compaction; active shared workloads prevent safe Docker shutdown/offline compaction.