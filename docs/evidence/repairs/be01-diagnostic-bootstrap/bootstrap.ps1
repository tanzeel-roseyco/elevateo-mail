param([Parameter(Mandatory = $true)][string]$EvidenceDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# AIDEV-NOTE: Process stdin sends exact LF bytes; fixed SSH arguments contain no nested shell program.
$scriptPath = Join-Path $PSScriptRoot 'bootstrap.sh'
$expected = '3ab389aa8f6d022afa3ea531d031b2912d3c0a8911b66ac761df5a4121424db3'
if ((Get-FileHash -LiteralPath $scriptPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Bootstrap hash mismatch' }
[byte[]]$bytes = [IO.File]::ReadAllBytes($scriptPath)
if ($bytes -contains 13 -or $bytes[0] -ne 35) { throw 'Expected literal LF shell file without BOM' }
if (Test-Path -LiteralPath $EvidenceDirectory) { throw 'Evidence destination already exists' }
$evidence = New-Item -ItemType Directory -Path $EvidenceDirectory -ErrorAction Stop
$info = New-Object System.Diagnostics.ProcessStartInfo
$info.FileName = (Get-Command ssh.exe -CommandType Application -ErrorAction Stop).Source
$info.Arguments = '-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=10 -o ServerAliveCountMax=3 fleet-02 timeout -k 5s 45s bash -s'
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.RedirectStandardInput = $true
$info.RedirectStandardOutput = $true
$info.RedirectStandardError = $true
$process = New-Object System.Diagnostics.Process
$process.StartInfo = $info
$nativeExit = 'UNKNOWN'
$timedOut = $false
$originalError = $null
$cleanupError = ''
$evidenceError = ''
$started = $false
$stdout = $null
$stderr = $null
try {
    if (-not $process.Start()) { throw 'SSH did not start' }
    $started = $true
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
    $process.StandardInput.Close()
    if ($process.WaitForExit(75000)) { $nativeExit = $process.ExitCode }
    else { $timedOut = $true }
} catch {
    $originalError = $_
} finally {
    # AIDEV-NOTE: Dispose cannot stop SSH; every post-start path must terminate/reap this exact process first.
    if ($started) {
        try {
            if (-not $process.HasExited) { $process.Kill() }
            if (-not $process.WaitForExit(10000)) { throw 'SSH termination uncertain' }
            if ($nativeExit -eq 'UNKNOWN') { $nativeExit = $process.ExitCode }
        } catch { $cleanupError = $_.Exception.GetType().FullName }
    }
    # AIDEV-NOTE: Exit can precede pipe EOF; both streams share one bounded drain window, even on failure.
    $drain = [Diagnostics.Stopwatch]::StartNew()
    while (($null -ne $stdout -and -not $stdout.IsCompleted) -or ($null -ne $stderr -and -not $stderr.IsCompleted)) {
        if ($drain.ElapsedMilliseconds -ge 5000) { break }
        [Threading.Thread]::Sleep(10)
    }
    $drain.Stop()
    # AIDEV-NOTE: Incomplete pipes fail closed; output errors never replace the original failure or native exit.
    foreach ($stream in @(@('stdout.log', $stdout), @('stderr.log', $stderr))) {
        if ($null -ne $stream[1]) {
            try {
                if (-not $stream[1].IsCompleted) { throw 'Output incomplete' }
                [IO.File]::WriteAllText((Join-Path $evidence.FullName $stream[0]), $stream[1].GetAwaiter().GetResult())
            } catch { $evidenceError += "$($stream[0]):$($_.Exception.GetType().FullName);" }
        }
    }
    $failure = if ($null -eq $originalError) { '' } else { $originalError.Exception.GetType().FullName }
    try {
        [IO.File]::WriteAllText((Join-Path $evidence.FullName 'native.status'), "native_ssh_exit=$nativeExit`ntimeout=$timedOut`n")
        [IO.File]::WriteAllText((Join-Path $evidence.FullName 'caller.status'), "native_ssh_exit=$nativeExit`ntimeout=$timedOut`ncaller_error_type=$failure`ncleanup_error_type=$cleanupError`nevidence_error=$evidenceError`n")
    } catch {
        $evidenceError += 'status_write_failed;'
        [Console]::Error.WriteLine("status_write_failed native_ssh_exit=$nativeExit timeout=$timedOut")
    }
    $process.Dispose()
}
if ($null -ne $originalError) { throw $originalError }
if ($timedOut) { exit 124 }
if ($nativeExit -ne 'UNKNOWN' -and $nativeExit -ne 0) { exit $nativeExit }
if ($cleanupError -ne '' -or $evidenceError -ne '' -or $nativeExit -eq 'UNKNOWN') { exit 1 }
exit 0
