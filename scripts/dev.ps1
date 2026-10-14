# AIDEV-NOTE: Advertise only existing Compose services; seed/check have no maintained implementation.
param([Parameter(Mandatory = $true)][ValidateSet('bootstrap','up','migrate','stop')][string]$Command)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
function Invoke-Dc { docker compose -f compose.yaml --env-file ops/local/.env @args; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
switch ($Command) {
  'bootstrap' { docker compose -f ops/compose.secrets.yaml run --rm secrets; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
                Invoke-Dc build api; Invoke-Dc up -d --wait db; Invoke-Dc run --rm bootstrap }
  'up'      { Invoke-Dc up -d --wait db auth rest storage mailpit api worker }
  'migrate' { Invoke-Dc run --rm migrate }
  'stop'    { Invoke-Dc stop }
}
