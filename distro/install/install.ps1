# argos-daemon installer (Windows PowerShell)
#
# Usage:
#   $env:ARGOS_VERSION = "v0.2.0"; irm https://raw.githubusercontent.com/dvaJi/argos/v0.2.0/distro/install/install.ps1 | iex
#
# Options (env):
#   $env:ARGOS_VERSION       Pin a release tag (e.g. "v0.1.0"). Default: latest release.
#   $env:ARGOS_INSTALL_DIR   Override install directory (default: %USERPROFILE%\.argos\bin).

$ErrorActionPreference = "Stop"

$Repo = "dvaJi/argos"
$BinaryName = "argos-daemon"

function Fail([string]$Message) {
  Write-Host "error: $Message" -ForegroundColor Red
  exit 1
}

# --- detect arch -----------------------------------------------------------
$Arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLower()
switch ($Arch) {
  "x64" { $Arch = "x64" }
  "arm64" { $Arch = "arm64" }
  default { Fail "Unsupported architecture: $Arch" }
}

$Asset = "$BinaryName-windows-$Arch.exe"
$ShaAsset = "$Asset.sha256"

# --- resolve version -------------------------------------------------------
if ($env:ARGOS_VERSION) {
  $Tag = $env:ARGOS_VERSION
} else {
  Write-Host "> Resolving latest release for $Repo..." -ForegroundColor Cyan
  try {
    $Latest = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ "User-Agent" = "argos-installer" }
    $Tag = $Latest.tag_name
  } catch {
    Fail "Could not resolve latest release tag: $($_.Exception.Message)"
  }
}

if (-not $Tag) { Fail "Could not resolve latest release tag." }

Write-Host "> Installing $BinaryName $Tag (windows/$Arch)" -ForegroundColor Cyan

# --- install dir -----------------------------------------------------------
$InstallDir = if ($env:ARGOS_INSTALL_DIR) { $env:ARGOS_INSTALL_DIR } else { Join-Path $env:USERPROFILE ".argos\bin" }
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$BaseUrl = "https://github.com/$Repo/releases/download/$Tag"
$Tmp = New-Item -ItemType Directory -Path (Join-Path $env:TEMP "argos-install-$(Get-Random)") -Force
$AssetPath = Join-Path $Tmp.FullName $Asset

# --- download --------------------------------------------------------------
Write-Host "> Downloading $Asset..."
try {
  Invoke-WebRequest -Uri "$BaseUrl/$Asset" -OutFile $AssetPath -UseBasicParsing
} catch {
  Fail "Download failed for $BaseUrl/$Asset.`nThis platform may not have a published build yet.`nCheck available assets: https://github.com/$Repo/releases/tag/$Tag"
}

# --- verify ---------------------------------------------------------------
$ShaUri = "$BaseUrl/$ShaAsset"
try {
  $ShaContent = (Invoke-RestMethod -Uri $ShaUri).Trim()
} catch {
  Fail "Checksum asset is unavailable for $Asset; refusing to install."
}

Write-Host "> Verifying checksum..."
$Expected = ($ShaContent -split '\s+')[0]
$Actual = (Get-FileHash -Path $AssetPath -Algorithm SHA256).Hash.ToLower()
if ($Expected.ToLower() -ne $Actual) {
  Fail "Checksum mismatch.`n  expected: $Expected`n  actual:   $Actual"
}

# --- install ---------------------------------------------------------------
$InstallPath = Join-Path $InstallDir "$BinaryName.exe"
Move-Item -Path $AssetPath -Destination $InstallPath -Force

Write-Host ""
Write-Host "Installed $InstallPath" -ForegroundColor Green

# --- PATH hint -------------------------------------------------------------
$PathUser = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($PathUser -notlike "*$InstallDir*") {
  Write-Host ""
  Write-Host "Add $InstallDir to your PATH:"
  Write-Host "  [Environment]::SetEnvironmentVariable('PATH', `"$InstallDir;`$([Environment]::GetEnvironmentVariable('PATH','User'))`", 'User')"
}

Write-Host ""
Write-Host "Run $BinaryName --help to get started."
