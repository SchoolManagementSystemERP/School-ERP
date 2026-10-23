<#
  Schedules school_erp backups with Windows Task Scheduler for the current Windows user:
    - "SchoolERP Full Backup"  every day at 02:00
    - "SchoolERP Log Backup"   every hour
    - "SchoolERP Maintenance"  Sundays at 03:00
  and gives the SQL Server service account write access to the backup folder.

    powershell -ExecutionPolicy Bypass -File install-backup-tasks.ps1

  The tasks run while this user is signed in. For an always-on server, use SQL Server Agent
  (or set the tasks to "Run whether user is logged on or not" in Task Scheduler).
#>
param(
  [string] $Folder = "D:\SQLBackups\school_erp",
  [string] $ServiceAccount = "NT Service\MSSQLSERVER"
)
$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $Folder | Out-Null
icacls $Folder /grant "${ServiceAccount}:(OI)(CI)M" | Out-Null

$script = Join-Path $PSScriptRoot "backup.ps1"
function Register-Backup($name, $type, $trigger) {
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -Type $type -Folder `"$Folder`""
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description "School ERP: $type backup of school_erp to $Folder" -Force | Out-Null
  Write-Output "Scheduled: $name"
}

Register-Backup "SchoolERP Full Backup" "Full" (New-ScheduledTaskTrigger -Daily -At "02:00")
$hourly = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddHours((Get-Date).Hour + 1) -RepetitionInterval (New-TimeSpan -Hours 1)
Register-Backup "SchoolERP Log Backup" "Log" $hourly

# Weekly cleanup of old sign-in tokens / OTPs and fresh statistics (dbo.usp_Maintenance).
$sqlcmd = (Get-Command sqlcmd.exe -ErrorAction SilentlyContinue).Source
if (-not $sqlcmd) { $sqlcmd = "C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\SQLCMD.EXE" }
$maint = New-ScheduledTaskAction -Execute $sqlcmd -Argument "-S localhost -E -C -b -d school_erp -Q `"EXEC dbo.usp_Maintenance`""
Register-ScheduledTask -TaskName "SchoolERP Maintenance" -Action $maint -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At "03:00") -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable) -Description "School ERP: weekly cleanup and statistics" -Force | Out-Null
Write-Output "Scheduled: SchoolERP Maintenance"
