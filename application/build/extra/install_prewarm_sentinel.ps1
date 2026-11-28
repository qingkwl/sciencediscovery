# ScienceDiscovery install-time Defender prewarm sentinel [W34-③]
#
# Launched detached by installer.nsh's customInit (.onInit, before extraction
# starts; the PS1 itself is staged to $PLUGINSDIR from the build resources
# tree because $INSTDIR\resources does not exist yet at that point). Waits for
# the directory-confirmation marker written by NSIS's .onVerifyInstDir
# callback, polls the main exe with an exclusive-read probe until NSIS
# finishes writing it, then launches the main-exe probe in
# ELECTRON_RUN_AS_NODE mode with stdin closed — the process loads nothing of
# the app, triggers the Defender image scan inside CreateProcess, and exits
# as soon as stdin EOF propagates. The scan thus runs DURING the remaining
# extraction window instead of at first launch.
#
# The marker carries the BARE $INSTDIR (the directory page's value BEFORE
# assistedInstaller's instFilesPre appends "\<APP_FILENAME>"): that append
# decision runs later than .onVerifyInstDir, so this script cannot know its
# answer either — it resolves the final exe by probing BOTH candidates and
# watching whichever appears first. The file itself is the ground truth.
#
# Fail-open discipline: every failure path just exits quietly — worst case
# the install tail's own background probes (installer.nsh customInstall)
# still cover the warm-up, and beyond those the cost is exactly what a
# pre-W30 install paid. The sentinel never blocks or fails an install.

$ErrorActionPreference = "SilentlyContinue"

$markerDir = Join-Path $env:TEMP "sd-sentinel"
$dirMarker = Join-Path $markerDir "dir.txt"
$firedMarker = Join-Path $markerDir "fired.txt"

# 1. Wait (up to 60s) for the installer to confirm the target directory.
#    .onVerifyInstDir fires on every directory-page change (the initial
#    default included); the sentinel's wait overlaps the user's page
#    navigation. Silent installs write the marker on the first callback.
$deadline = [DateTime]::UtcNow.AddSeconds(60)
$dir = $null
while ([DateTime]::UtcNow -lt $deadline) {
  if (Test-Path -LiteralPath $dirMarker) {
    $dir = (Get-Content -LiteralPath $dirMarker -Raw).Trim()
    if ($dir) { break }
  }
  Start-Sleep -Milliseconds 500
}
if (-not $dir) { exit 0 }

# Both landing spots for the main exe, per instFilesPre's append rule:
#   $dir\ScienceDiscovery.exe                      (dir already has APP_FILENAME)
#   $dir\ScienceDiscovery\ScienceDiscovery.exe     (append fires)
$exeCandidates = @(
  (Join-Path $dir "ScienceDiscovery.exe"),
  (Join-Path $dir "ScienceDiscovery\ScienceDiscovery.exe")
)

# 2. Poll (up to 180s) for the main exe to be fully written: an exclusive
#    read open succeeds only when the writer (NSIS's File instruction) has
#    closed its handle. Size gate: an Electron main exe is ~100+ MB; a torn
#    or placeholder file must not be executed. The exclusive open itself
#    already rejects a half-written image; the size check is belt and
#    braces.
$deadline = [DateTime]::UtcNow.AddSeconds(180)
$exe = $null
while ([DateTime]::UtcNow -lt $deadline) {
  foreach ($candidate in $exeCandidates) {
    try {
      $stream = [IO.File]::Open($candidate, "Open", "Read", "None")
      $length = $stream.Length
      $stream.Close()
      if ($length -gt 100MB) { $exe = $candidate; break }
    } catch {
      # Not yet created, or still being written (sharing violation).
    }
  }
  if ($exe) { break }
  Start-Sleep -Milliseconds 500
}
if (-not $exe) { exit 0 }

# 3. Fire the background probe: ELECTRON_RUN_AS_NODE makes the exe run as a
#    plain Node runtime (no app code, no window, no single-instance lock),
#    and redirecting stdin from NUL gives the Node REPL an immediate EOF so
#    the process exits on its own right after the scan-triggered image
#    load. cmd's `start /b` keeps it detached from the sentinel, and the
#    sentinel itself exits immediately — nothing waits on the scan.
#    The nested quoting form (outer "..." with inner "..." around a path
#    that may contain spaces) is the one field-verified on this machine.
New-Item -ItemType Directory -Force -Path $markerDir | Out-Null
Set-Content -LiteralPath $firedMarker -Value ([DateTime]::UtcNow.ToString("o")) -NoNewline

$cmd = "set ELECTRON_RUN_AS_NODE=1&& `"$exe`" < nul"
Start-Process -FilePath "$env:ComSpec" -ArgumentList "/c", $cmd -WindowStyle Hidden

exit 0
