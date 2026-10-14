param(
  [Parameter(Mandatory = $true)][string]$RepositoryRoot
)
$ErrorActionPreference = 'Stop'
$native = Join-Path $RepositoryRoot 'apps/native/src-tauri'
$web = Join-Path $RepositoryRoot 'apps/web/dist/index.html'
if (-not (Test-Path $web)) { throw 'Production web assets are missing' }
if (-not (Test-Path (Join-Path $native 'Cargo.lock'))) { throw 'Reviewed Cargo.lock is missing' }
Push-Location $native
try {
  cargo test --locked
  if ($LASTEXITCODE -ne 0) { throw 'Native unit tests failed' }
  cargo tauri build --locked --bundles nsis
  if ($LASTEXITCODE -ne 0) { throw 'NSIS build failed' }
  $artifacts = @(Get-ChildItem 'target/release/bundle/nsis/*-setup.exe' -ErrorAction Stop)
  if ($artifacts.Count -ne 1) { throw 'Expected one unsigned NSIS setup artifact' }
  $artifacts | Get-FileHash -Algorithm SHA256 | Format-Table -AutoSize
} finally {
  Pop-Location
}
