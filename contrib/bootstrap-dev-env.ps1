<#

.SYNOPSIS
  Bootstraps a Windows Cloud DevBox with WSL pre-reqs to develop in monitoring repo.

.NOTES

  - The script uninstalls Docker Desktop as it interferes with WSL2.
  - Must be run as Administrator in PowerShell 7+.

#>

#Requires -RunAsAdministrator

if ($PSVersionTable.PSVersion.Major -lt 7) {
    Write-Error "This script requires PowerShell 7+. You are running PowerShell $($PSVersionTable.PSVersion).`nTo launch PowerShell 7 as Administrator:`n  Start Menu > search 'pwsh' > right-click 'PowerShell 7' > 'Run as administrator'"
    exit 1
}

$dockerProcesses = @("Docker Desktop")
foreach ($process in $dockerProcesses) {
    try {
        Get-Process -Name $process -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    } catch {

    }
}

winget uninstall "Docker Desktop" --silent --force --accept-source-agreements 2>$null
$pkg = Get-ChildItem 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall' | Get-ItemProperty | Where-Object { $_.DisplayName -like "Docker Desktop*" };
if ($pkg) {
    $cmd = $pkg.UninstallString
    Start-Process "cmd.exe" -ArgumentList "/c $cmd /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /FORCECLOSEAPPLICATIONS" -Wait -ErrorAction SilentlyContinue
}
Remove-Item -Path "$env:PROGRAMFILES\Docker", "$env:PROGRAMDATA\Docker*", "$env:LOCALAPPDATA\Docker*", "$env:APPDATA\Docker*" -Recurse -Force -ErrorAction SilentlyContinue

if (wsl -l -q | Select-String -SimpleMatch "Ubuntu-24.04") {
    Write-Host "Unregistering Ubuntu-24.04"
    wsl --unregister Ubuntu-24.04
}

$memGB=[math]::Floor((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB)
$cpu=[Environment]::ProcessorCount
$swap=[math]::Floor($memGB/4)
@"
[wsl2]
memory=${memGB}GB
processors=$cpu
swap=${swap}GB
networkingMode=NAT
"@ | Set-Content -Path "$env:USERPROFILE\.wslconfig"

Write-Host "Restarting WSL to apply settings"
wsl --shutdown

winget install -e --id Microsoft.GitCredentialManagerCore

Write-Host "Installing Ubuntu-24.04"
wsl --install -d Ubuntu-24.04