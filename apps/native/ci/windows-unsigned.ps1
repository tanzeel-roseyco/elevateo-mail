param(
  [Parameter(Mandatory = $true)][string]$RepositoryRoot,
  [Parameter(Mandatory = $true)][string]$ApprovedWebOrigin
)
$ErrorActionPreference = 'Stop'
$parsed = $null
if (-not [Uri]::TryCreate($ApprovedWebOrigin, [UriKind]::Absolute, [ref]$parsed)) { throw 'Invalid web origin' }
if ($parsed.Scheme -ne 'https' -or $parsed.UserInfo -ne '' -or $parsed.Query -ne '' -or $parsed.Fragment -ne '' -or $parsed.AbsolutePath -ne '/') { throw 'Expected exact HTTPS origin' }
$canonicalHost = $parsed.DnsSafeHost.TrimEnd('.')
if ($canonicalHost -eq '' -or $canonicalHost -match '^(localhost|.*\.localhost|example\.com|.*\.example\.com|invalid|.*\.invalid|test|.*\.test)$') { throw 'Placeholder origin rejected' }
if ($parsed.HostNameType -ne [UriHostNameType]::Dns) { throw 'DNS host required' }
$native = Join-Path $RepositoryRoot 'apps/native/src-tauri'
if (-not (Test-Path (Join-Path $native 'Cargo.lock'))) { throw 'Reviewed Cargo.lock is missing' }
if (-not (Test-Path (Join-Path $native 'icons/icon.ico'))) { throw 'Reviewed Windows ICO is missing' }
$env:ELEVATEO_WEB_ORIGIN = $ApprovedWebOrigin
$env:ELEVATEO_NATIVE_ARTIFACT = 'unsigned-candidate'
Push-Location $native
try {
  cargo test --locked
  if ($LASTEXITCODE -ne 0) { throw 'Native unit tests failed' }
  cargo tauri build --bundles nsis -- --locked
  if ($LASTEXITCODE -ne 0) { throw 'NSIS build failed' }
  $artifacts = @(Get-ChildItem 'target/release/bundle/nsis/*-setup.exe' -ErrorAction Stop)
  if ($artifacts.Count -ne 1) { throw 'Expected one unsigned NSIS setup artifact' }
  $artifacts | Get-FileHash -Algorithm SHA256 | Format-Table -AutoSize
} finally {
  Pop-Location
  Remove-Item Env:ELEVATEO_WEB_ORIGIN -ErrorAction SilentlyContinue
  Remove-Item Env:ELEVATEO_NATIVE_ARTIFACT -ErrorAction SilentlyContinue
}
