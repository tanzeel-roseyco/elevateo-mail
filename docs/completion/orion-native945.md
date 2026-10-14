# NATIVE945 packaging asset checkpoint

Source-only inspection on branch `completion-orion-native812`, base `8d98b42c97834a56cfcb25eb4846a5ffbbd1faf5`. Actual worker identity: Orca Codex `gpt-6-sol`; requested billing tier is unverified. No application build, test, icon conversion, or package execution was run by Orion.

## Source and target references

`apps/native/src-tauri/icons/icon.png` is byte-identical to the reviewed shared brand source `/home/tanzeel/elevateo-mail-completion-20261015/brand/logo-icon.png`, SHA-256 `325d418f557e692314ee5c6cc56c2aa2baabb934527513b7080fabfa234922f4`. The native Cargo.lock SHA-256 is `0515d1a73797511503bf6c236d20d7a70a5ee808a9c9af423107567ee1b2be0d`. Base `tauri.conf.json` targets NSIS and has no explicit icon override; `ci/windows-unsigned.ps1` requires `src-tauri/icons/icon.ico`. The integrated macOS overlay targets DMG and has no icon override; its platform icon belongs at `src-tauri/icons/icon.icns`. The Android overlay has no icon reference. Both platform files are absent on this branch.

## Exact bounded request to Soren

Use Soren's sole fleet-02 Docker lease in a noncritical slot. Mount the immutable native candidate read-only at `/workspace`, use a task-owned output directory, and use a recorded immutable image digest containing Tauri CLI **exactly 2.12.2** (or install `tauri-cli` `=2.12.2` with `--locked` in a task-only image). Record the actual image digest, CLI version output, source commit and PNG hash. Inside that container, run:

```sh
set -eu
cd /workspace/apps/native/src-tauri
test "$(sha256sum icons/icon.png | cut -d ' ' -f 1)" = '325d418f557e692314ee5c6cc56c2aa2baabb934527513b7080fabfa234922f4'
case "$(cargo tauri --version)" in 'tauri-cli 2.12.2') ;; *) exit 1 ;; esac
output=/task-output/native945/icons
test ! -e "$output"
mkdir -p "$output"
cargo tauri icon icons/icon.png --output "$output"
test -s "$output/icon.ico"
test -s "$output/icon.icns"
sha256sum "$output/icon.ico" "$output/icon.icns"
```

Return both exact files at a retrievable task-owned path and their SHA-256 values before cleanup; report command exit and container/image cleanup. Orion will verify the returned bytes and source/tool receipt before importing only `icon.ico` and `icon.icns`. Generation is **PENDING**, not a passed gate. No image or package artifact is asserted here.

## Windows script and release limit

`ci/windows-unsigned.ps1` validates an exact HTTPS DNS origin, rejects reserved fixture domains after terminal-dot normalization, checks Cargo.lock and ICO presence, runs locked unit tests and NSIS build, requires exactly one setup EXE, and emits its SHA-256. It marks output `unsigned-candidate`. No demonstrated small packaging defect was found in this source inspection, so the script was not changed. A real Windows runner still needs pinned Rust/Tauri/NSIS tooling, an approved non-fixture HTTPS origin, the verified ICO, successful native build, install/run/login/logout evidence, and signing credentials before a signed release can be claimed. Linux Docker icon generation or Rust compilation cannot establish Windows NSIS or macOS DMG runtime behavior. The macOS overlay and native security core were untouched.

Review request: root should review this source-only request and any later exact asset-import commit before integration. Asset generation and all target-platform gates remain open.
