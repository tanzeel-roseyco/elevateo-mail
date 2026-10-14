$ErrorActionPreference = 'Stop'
$preflight = Join-Path $PSScriptRoot 'windows-unsigned.ps1'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
foreach ($origin in @('https://app.elevateo.invalid.', 'https://APP.ELEVATEO.INVALID./', 'https://app.elevateo.invalid..')) {
  try {
    & $preflight -RepositoryRoot $repositoryRoot -ApprovedWebOrigin $origin
    throw "Reserved origin unexpectedly accepted: $origin"
  } catch {
    if ($_.Exception.Message -ne 'Placeholder origin rejected') { throw }
  }
}
Write-Output 'Three reserved trailing-dot origins rejected before Cargo invocation.'
