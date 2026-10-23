<#
  Backs up the school_erp database and removes old backup files.

    powershell -ExecutionPolicy Bypass -File backup.ps1 -Type Full     # daily
    powershell -ExecutionPolicy Bypass -File backup.ps1 -Type Log      # hourly (FULL recovery model)

  Uses Windows authentication (no password stored). The SQL Server service account needs write
  access to -Folder; install-backup-tasks.ps1 sets that up and schedules both jobs.
#>
param(
  [ValidateSet("Full", "Log")] [string] $Type = "Full",
  [string] $Server = "localhost",
  [string] $Database = "school_erp",
  [string] $Folder = "D:\SQLBackups\school_erp",
  [int] $KeepDays = 14
)
$ErrorActionPreference = "Stop"

$sqlcmd = (Get-Command sqlcmd.exe -ErrorAction SilentlyContinue).Source
if (-not $sqlcmd) { $sqlcmd = "C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\SQLCMD.EXE" }

New-Item -ItemType Directory -Force -Path $Folder | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$ext = if ($Type -eq "Full") { "bak" } else { "trn" }
$file = Join-Path $Folder "$Database-$($Type.ToLower())-$stamp.$ext"
$what = if ($Type -eq "Full") { "DATABASE" } else { "LOG" }

$sql = @"
SET NOCOUNT ON;
BACKUP $what [$Database] TO DISK = N'$file' WITH COMPRESSION, CHECKSUM, INIT, NAME = N'$Database $Type $stamp';
RESTORE VERIFYONLY FROM DISK = N'$file' WITH CHECKSUM;
"@
& $sqlcmd -S $Server -E -C -b -Q $sql
if ($LASTEXITCODE -ne 0) { throw "Backup failed ($Type) - see the messages above." }

# Keep the last $KeepDays days (always keep the newest full backup).
$cutoff = (Get-Date).AddDays(-$KeepDays)
$newestFull = Get-ChildItem $Folder -Filter "$Database-full-*.bak" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Get-ChildItem $Folder -File | Where-Object { $_.LastWriteTime -lt $cutoff -and $_.FullName -ne $newestFull.FullName } | Remove-Item -Force

Write-Output "OK $Type backup: $file ($([math]::Round((Get-Item $file).Length / 1MB, 2)) MB)"
