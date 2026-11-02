# Native Linux verification — 2026-11-01

All commands ran with `DOCKER_CONTEXT=desktop-linux`. No macOS artifact was produced.

Lockfile regeneration:
```powershell
docker run --rm --memory=512m --cpus=1 --mount "type=bind,source=$PWD/apps/native/src-tauri,target=/workspace" -w /workspace rust:1.90.0-bookworm@sha256:3914072ca0c3b8aad871db9169a651ccfce30cf58303e5d6f2db16d1d8a7e58f cargo generate-lockfile
```

Final gate (owned source copy, one Cargo job, 2 GB container):
```powershell
docker run --name elevateo-client-native-gate-20261101 --memory=2000m --cpus=1 --mount "type=bind,source=$PWD,target=/src,readonly" --mount "type=bind,source=$PWD/docs/completion/final-readiness-20261101,target=/evidence" elevateo-client-native-tools:20261101 bash /evidence/native-gate.sh
```

The final execution used `docker start -a elevateo-client-native-gate-20261101` to retain compiled dependencies across repairs. Exact recipe: `native-tools.Dockerfile`, `native-gate.sh`.

| Command inside container | Result |
| --- | --- |
| `cargo fmt --all -- --check` | PASS after rustfmt-only repairs |
| `cargo test --locked` | 40 passed, 0 failed |
| `cargo check --locked` | PASS |
| `cargo clippy --locked --all-targets -- -D clippy::all` | PASS after two lint repairs |
| `python3 ../ci/verify_boundary.py` | PASS |
| `python3 -m unittest test_macos_release test_validate_macos_config` | 14 passed, 0 failed |
| Android package/build unittest discovery | 42 + 26 passed, 0 failed |
| `python3 /evidence/test_native_gate.py` in native-tools container | 1 passed (four failed-directory subcases) |

`-D warnings` failed: eight existing dead-code compiler warnings remain in the native auth contract scaffold and macOS-only bundle helpers. The final Clippy command enforces Clippy rules, not a warning-free compiler build. No allow attributes were added. The two Clippy repairs remove a needless borrow and use `repeat_n` in the existing oversized-callback regression. Formatting covers six Rust files; no other behavior change was intended.

The first wrapper failed because Tauri generates schema files beside its source; the corrected wrapper copies source into owned container storage. Review then found unchecked directory changes; all four now fail closed, with an executable regression.

Evidence: `native-lock.log`, `native-final-gate-resumed.log` (strict lint failure), `native-final-retry.log` (test lint failure), `native-final-clean.log` (all gates exit 0), `native-wrapper-regression.log`. Mac `.dmg`, signing/notarization, Keychain and real WebView/update behavior require a macOS host and remain unverified.

Cleanup: completed native, iOS and web gate containers removed after mount inspection. No other build was running. Builder prune reclaimed 0 B; image prune reclaimed 4.562 GB. No volumes touched. Active shared preview prevents shutting down Docker for offline VHD compaction; internal reclaimed space is not a claim of equal host-space recovery.
