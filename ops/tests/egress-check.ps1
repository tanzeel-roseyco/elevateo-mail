param([Parameter(Mandatory = $true)][string]$Project)
$ErrorActionPreference = 'Stop'
# AIDEV-NOTE: Only Docker orchestration runs on the host; assertions share the Linux wrapper's container code.
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Ruby = 'ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2'
$Nonce = [Guid]::NewGuid().ToString()
$Prefix = "be01r1-$Nonce"
$Containers = [Collections.Generic.List[string]]::new()
$Networks = [Collections.Generic.List[string]]::new()
$Label = "elevateo.r1.invocation=$Nonce"
$Mount = "type=bind,src=$Root/ops/tests,dst=/tests,readonly"
function Invoke-Docker {
    $output = & docker @args
    if ($LASTEXITCODE -ne 0) { throw 'Docker command failed; no isolation result established' }
    return $output
}
function Assert-Json([string]$Json, [string[]]$Arguments) {
    $Json | & docker run --rm -i --network none --label $Label --mount $Mount $Ruby ruby /tests/egress_assert.rb @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Container assertion failed' }
}
function Assert-OpenRejected([string]$Json) {
    $rejection = $Json | & docker run --rm -i --network none --label $Label --mount $Mount $Ruby ruby /tests/egress_assert.rb outcome denied
    if ($LASTEXITCODE -ne 42 -or ($rejection -join "`n") -cne 'R1_OPEN_CONTROL_REJECTED') {
        throw 'Denial checker did not establish semantic rejection; inconclusive'
    }
}
function New-Network([string]$Name, [switch]$Internal) {
    & docker network inspect $Name *> $null
    if ($LASTEXITCODE -eq 0) { throw 'Network name collision' }
    $options = @('network', 'create', '--label', $Label)
    if ($Internal) { $options += '--internal' }
    $id = [string](Invoke-Docker @options $Name)
    $Networks.Add($id)
    return $id
}
function New-Listener([string]$Name, [string]$Network, [int]$Port, [string]$Publish = '') {
    & docker inspect $Name *> $null
    if ($LASTEXITCODE -eq 0) { throw 'Container name collision' }
    $options = @('create', '--name', $Name, '--label', $Label, '--network', $Network, '--mount', $Mount)
    if ($Publish) { $options += @('-p', $Publish) }
    $id = [string](Invoke-Docker @options $Ruby ruby /tests/egress_listener.rb $Port)
    $Containers.Add($id)
    Invoke-Docker start $id | Out-Null
    return $id
}
function Get-Probe([string]$Target, [string]$Address, [string]$Port) {
    return [string](Invoke-Docker run --rm --network "container:$Target" --label $Label --mount $Mount `
        $Ruby ruby /tests/egress_probe.rb $Address $Port)
}
function Assert-Probe([string]$Target, [string]$Address, [string]$Port, [string]$Expected) {
    Assert-Json (Get-Probe $Target $Address $Port) @('outcome', $Expected)
}
function Get-Target([string]$Service) {
    $ids = @(Invoke-Docker ps -q --filter "label=com.docker.compose.project=$Project" --filter "label=com.docker.compose.service=$Service")
    if ($ids.Count -ne 1) { throw 'Target missing or ambiguous' }
    return [string]$ids[0]
}
function Get-Inspection([string]$Id, [switch]$Network) {
    if ($Network) { return (Invoke-Docker network inspect $Id) -join "`n" }
    return (Invoke-Docker inspect $Id) -join "`n"
}
$Failed = $false
try {
    Invoke-Docker image inspect $Ruby | Out-Null
    $ids = @(Invoke-Docker network ls -q --filter "label=com.docker.compose.project=$Project" --filter 'label=com.docker.compose.network=runtime')
    if ($ids.Count -ne 1) { throw 'Runtime network missing or ambiguous' }
    $RuntimeId = [string]$ids[0]
    $Runtime = [string](Invoke-Docker network inspect -f '{{.Name}}' $RuntimeId)
    $Database = Get-Target 'db'
    Assert-Json (Get-Inspection $Database) @('target', $Project, 'db', $Runtime)
    $databaseInspection = @(Get-Inspection $Database | ConvertFrom-Json)
    $DatabaseIp = [string]$databaseInspection[0].NetworkSettings.Networks.$Runtime.IPAddress
    $External = New-Network "$Prefix-external"
    $Gateway = [string](Invoke-Docker network inspect -f '{{(index .IPAM.Config 0).Gateway}}' $External)
    $Listener = New-Listener "$Prefix-external" $External 8080 "${Gateway}::8080"
    Assert-Json (Get-Inspection $Listener) @('publication', $Gateway)
    $listenerInspection = @(Get-Inspection $Listener | ConvertFrom-Json)
    $Port = [string]$listenerInspection[0].NetworkSettings.Ports.'8080/tcp'[0].HostPort
    $Internal = New-Network "$Prefix-internal" -Internal
    $Open = New-Network "$Prefix-open"
    $InternalTarget = New-Listener "$Prefix-internal" $Internal 5432
    $OpenTarget = New-Listener "$Prefix-open" $Open 5432
    $Ready = $false
    foreach ($attempt in 1..5) {
        $result = Get-Probe $OpenTarget $Gateway $Port
        try { Assert-Json $result @('outcome', 'unrestricted'); $Ready = $true; break }
        catch { Start-Sleep -Seconds 1 }
    }
    if (-not $Ready) { throw 'Gateway publication unsupported or fixture failed: return to design gate' }
    foreach ($control in @(@($Internal, $InternalTarget, 'denied', 'true'), @($Open, $OpenTarget, 'connected', 'false'))) {
        Assert-Json (Get-Inspection $control[0] -Network) @('network', $Gateway, $control[3])
        Assert-Probe $control[1] '127.0.0.1' '5432' 'connected'
        Assert-Probe $control[1] $Gateway $Port $control[2]
    }
    $openResult = Get-Probe $OpenTarget $Gateway $Port
    Assert-Json $openResult @('outcome', 'unrestricted')
    Assert-OpenRejected $openResult
    Write-Output 'controls: internal denied; equivalent open connected (checker violation)'
    Assert-Json (Get-Inspection $RuntimeId -Network) @('network', $Gateway, 'true')
    foreach ($service in @('api', 'worker', 'auth', 'mailpit', 'storage', 'rest')) {
        $target = Get-Target $service
        Assert-Json (Get-Inspection $target) @('target', $Project, $service, $Runtime)
        Assert-Probe $target $DatabaseIp '5432' 'connected'
        Assert-Probe $target $Gateway $Port 'denied'
        Write-Output "${service}: local control connected; external no-route denial verified"
    }
} catch {
    Write-Error -ErrorAction Continue $_.Exception.Message
    $Failed = $true
} finally {
    # Capture IDs only after creation succeeds; verify labels and mounts before every destructive call.
    foreach ($id in $Containers) {
        try {
            Assert-Json (Get-Inspection $id) @('owned', $Nonce, 'container')
            Invoke-Docker rm -f $id | Out-Null
        } catch { Write-Warning 'Retained container: cleanup verification/removal failed'; $Failed = $true }
    }
    foreach ($id in $Networks) {
        try {
            Assert-Json (Get-Inspection $id -Network) @('owned', $Nonce, 'network')
            Invoke-Docker network rm $id | Out-Null
        } catch { Write-Warning 'Retained network: cleanup verification/removal failed'; $Failed = $true }
    }
    & docker system df
    Get-PSDrive -PSProvider FileSystem | Select-Object Name, Free, Used
}
if ($Failed) { exit 1 }
