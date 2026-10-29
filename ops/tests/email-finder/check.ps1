param([string]$Context = 'desktop-linux')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$task = 'email-finder-check-' + [guid]::NewGuid().ToString('N').Substring(0, 10)
$evidence = Join-Path $root ".local-jobs/$task"
New-Item -ItemType Directory -Path $evidence | Out-Null
$envFile = Join-Path $evidence '.env'
$serverImage = "${task}-server"
$webImage = "${task}-web"
$webContainer = "${task}-web"
$failures = [Collections.Generic.List[string]]::new()
$localContextValidated = $false
$composeArgs = @('--context', $Context, 'compose', '--env-file', $envFile, '-p', $task,
  '-f', (Join-Path $root 'ops/compose.be02-test.yaml'), '-f', (Join-Path $PSScriptRoot 'local.yaml'))

function Invoke-Docker([string]$Label, [string[]]$Arguments, [switch]$ContinueOnFailure) {
  Write-Host "Running $Label"
  # AIDEV-NOTE: Windows PowerShell wraps native stderr as errors, including Docker's normal build progress.
  $ErrorActionPreference = 'Continue'
  & docker @Arguments 2>&1 | Tee-Object -FilePath (Join-Path $evidence "$Label.txt") | Out-Host
  $nativeExit = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($nativeExit -ne 0) {
    $failures.Add($Label)
    if (-not $ContinueOnFailure) { throw "$Label failed ($nativeExit)" }
  }
}
function Invoke-Compose([string]$Label, [string[]]$Arguments, [switch]$ContinueOnFailure) {
  Invoke-Docker $Label ($composeArgs + $Arguments) -ContinueOnFailure:$ContinueOnFailure
}

# AIDEV-NOTE: Generated credentials belong only to the isolated RAM database and are removed in finally.
$values = [ordered]@{
  BE02_SOURCE = $root.Replace('\', '/'); BE02_PROJECT = $task; BE02_SERVER_IMAGE = $serverImage
  POSTGRES_PASSWORD = [guid]::NewGuid().ToString('N'); MIGRATOR_DB_PASSWORD = [guid]::NewGuid().ToString('N')
  API_DB_PASSWORD = [guid]::NewGuid().ToString('N'); WORKER_DB_PASSWORD = [guid]::NewGuid().ToString('N')
  ATTACHMENT_GATEWAY_DB_PASSWORD = [guid]::NewGuid().ToString('N')
  SECRET_KEY_BASE = ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
  BE02_FIXTURE_SIGNING_SECRET = [guid]::NewGuid().ToString('N')
  ELEVATEO_SESSION_KEY_BASE64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([guid]::NewGuid().ToString('N')))
}
[IO.File]::WriteAllLines($envFile, @($values.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }))
try {
  $endpoint = & docker context inspect $Context --format '{{.Endpoints.docker.Host}}'
  if ($LASTEXITCODE -ne 0 -or $endpoint -notmatch '^npipe://') { throw 'Only a local Docker Desktop named pipe is allowed' }
  $localContextValidated = $true
  Invoke-Docker 'disk-before' @('--context', $Context, 'system', 'df')
  Invoke-Compose 'config' @('config', '--quiet')
  Invoke-Docker 'server-build' @('--context', $Context, 'build', '-t', $serverImage, (Join-Path $root 'apps/server'))
  Invoke-Compose 'database-start' @('up', '-d', '--wait', '--wait-timeout', '120', 'db', 'mailpit')
  foreach ($step in @('bootstrap', 'bootstrap-send')) {
    Invoke-Compose $step @('run', '--rm', '--no-deps', 'bootstrap', '-f', "/ops/$step.sql")
  }
  Invoke-Compose 'bootstrap-gateway' @('run', '--rm', '--no-deps', 'bootstrap', '-f', '/gateway-bootstrap.sql')
  Invoke-Compose 'auth-start' @('up', '-d', '--wait', '--wait-timeout', '120', 'auth')
  Invoke-Compose 'auth-grants' @('run', '--rm', '--no-deps', 'bootstrap', '-f', '/ops/bootstrap-auth-grants.sql')
  Invoke-Compose 'migrate' @('run', '--rm', '--no-deps', 'migrate')
  Invoke-Compose 'backend-gates' @('run', '--rm', '--no-deps', 'test') -ContinueOnFailure
  Invoke-Compose 'backend-supplemental' @('run', '--rm', '--no-deps', '-v', ((Join-Path $PSScriptRoot 'supplemental.sh').Replace('\', '/') + ':/supplemental.sh:ro'), 'test', 'bash', '/supplemental.sh') -ContinueOnFailure
  Invoke-Compose 'contracts-v1' @('run', '--rm', '--no-deps', 'test', 'bundle', 'exec', 'ruby', '/workspace/contracts/v1/tests/send_contract_test.rb') -ContinueOnFailure
  Invoke-Compose 'contracts-v2' @('run', '--rm', '--no-deps', 'test', 'bundle', 'exec', 'ruby', '/workspace/contracts/v2/contract_test.rb') -ContinueOnFailure
  Invoke-Docker 'web-build' @('--context', $Context, 'build', '-f', (Join-Path $PSScriptRoot 'web.Dockerfile'), '-t', $webImage, $root)
  # AIDEV-NOTE: No external network is needed at test time; Playwright serves fixtures inside its container.
  Invoke-Docker 'web-gates' @('--context', $Context, 'run', '--name', $webContainer, '--network', 'none', '--shm-size', '1g',
    '--mount', "type=bind,source=$(Join-Path $PSScriptRoot 'web-gates.sh'),target=/web-gates.sh,readonly",
    $webImage, 'bash', '/web-gates.sh') -ContinueOnFailure
  Invoke-Docker 'generated-contract' @('--context', $Context, 'cp', "${webContainer}:/workspace/apps/web/src/data/generated/api-v2.d.ts", (Join-Path $root 'apps/web/src/data/generated/api-v2.d.ts'))
  Invoke-Docker 'browser-evidence' @('--context', $Context, 'cp', "${webContainer}:/workspace/apps/web/e2e/.results", (Join-Path $evidence 'screenshots')) -ContinueOnFailure
  # Config parsing does not contact a daemon or deploy; the env file contains disposable test values only.
  $dryEnv = @('--env', ('ELEVATEO_PRODUCTION_IMAGE=sha256:' + ('a' * 64)), '--env', 'ELEVATEO_API_ENV_FILE=/check.env',
    '--env', 'ELEVATEO_WORKER_ENV_FILE=/check.env', '--env', 'ELEVATEO_GATEWAY_ENV_FILE=/check.env')
  Invoke-Docker 'deployment-config' (@('--context', $Context, 'run', '--rm', '--network', 'none',
    '--mount', "type=bind,source=$(Join-Path $root 'ops/production'),target=/production,readonly",
    '--mount', "type=bind,source=$envFile,target=/check.env,readonly") + $dryEnv + @('docker:27-cli', 'sh', '/production/deploy.sh', 'config', '--quiet')) -ContinueOnFailure
} catch {
  $failures.Add("Fatal: $($_.Exception.Message)")
  Write-Warning $_.Exception.Message
  $ErrorActionPreference = 'Continue'
  if ($localContextValidated) {
    & docker @composeArgs logs --no-color 2>&1 | Out-File (Join-Path $evidence 'failure-services.txt')
  }
} finally {
  $ErrorActionPreference = 'Continue'
  # AIDEV-NOTE: Remove only this invocation's containers/images; no volume deletion or global pruning occurs here.
  if ($localContextValidated) {
    # AIDEV-NOTE: Failed builds may leave no image/container; only remove resources confirmed present.
    & docker --context $Context container inspect $webContainer *> $null
    if ($LASTEXITCODE -eq 0) {
      & docker --context $Context rm -f $webContainer 2>&1 | Out-Host
      if ($LASTEXITCODE -ne 0) { $failures.Add('web-container-cleanup') }
    }
    & docker @composeArgs down --remove-orphans 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { $failures.Add('compose-cleanup') }
    foreach ($taskImage in @($serverImage, $webImage)) {
      & docker --context $Context image inspect $taskImage *> $null
      if ($LASTEXITCODE -eq 0) {
        & docker --context $Context image rm $taskImage 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) { $failures.Add('image-cleanup') }
      }
    }
    & docker --context $Context system df 2>&1 | Out-File (Join-Path $evidence 'disk-after.txt')
  }
  if (Test-Path -LiteralPath $envFile) { Remove-Item -LiteralPath $envFile }
  [IO.File]::WriteAllText((Join-Path $evidence 'result.txt'), "Failed gates: $($failures -join ', ')`nEvidence: $evidence")
}
if ($failures.Count -gt 0) { throw "Failed gates: $($failures -join ', ')" }
Write-Host "All gates passed. Evidence: $evidence"
