<#
  Brings an existing school_erp database up to date:
    1. runs every database/migrations/*.sql not yet recorded in dbo.SchemaMigration (in name order)
    2. re-applies constraints.sql (foreign keys, checks, indexes) and procedures.sql - both idempotent

    powershell -ExecutionPolicy Bypass -File database\migrate.ps1 [-Server localhost] [-Database school_erp]

  Uses Windows authentication with an administrator account (the API's erp_app login cannot change tables).
  How to add a migration: edit prisma/schema.prisma, regenerate schema.sql (see README), write the
  difference as migrations/NNN-name.sql, then run this script. Re-run scripts/gen-constraints.mjs too.
#>
param(
  [string] $Server = "localhost",
  [string] $Database = "school_erp"
)
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$sqlcmd = (Get-Command sqlcmd.exe -ErrorAction SilentlyContinue).Source
if (-not $sqlcmd) { $sqlcmd = "C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\SQLCMD.EXE" }

function Invoke-Sql([string] $query) {
  $out = & $sqlcmd -S $Server -E -C -I -b -d $Database -W -h -1 -Q "SET NOCOUNT ON; $query"
  if ($LASTEXITCODE -ne 0) { throw "SQL failed: $query`n$out" }
  return $out
}
function Invoke-SqlFile([string] $file) {
  & $sqlcmd -S $Server -E -C -I -b -d $Database -i $file
  if ($LASTEXITCODE -ne 0) { throw "Failed: $file" }
}

Invoke-Sql "IF OBJECT_ID(N'dbo.SchemaMigration', N'U') IS NULL CREATE TABLE dbo.SchemaMigration (name NVARCHAR(200) NOT NULL CONSTRAINT PK_SchemaMigration PRIMARY KEY, appliedAt DATETIME2 NOT NULL CONSTRAINT DF_SchemaMigration_appliedAt DEFAULT SYSUTCDATETIME());" | Out-Null
$applied = @(Invoke-Sql "SELECT name FROM dbo.SchemaMigration;") | ForEach-Object { $_.Trim() } | Where-Object { $_ }

$pending = Get-ChildItem (Join-Path $here "migrations") -Filter *.sql | Sort-Object Name | Where-Object { $applied -notcontains $_.Name }
foreach ($m in $pending) {
  Write-Output "Applying $($m.Name)..."
  Invoke-SqlFile $m.FullName
  Invoke-Sql "INSERT INTO dbo.SchemaMigration (name) VALUES (N'$($m.Name)');" | Out-Null
}
if (-not $pending) { Write-Output "No pending migrations." }

Write-Output "Applying constraints.sql and procedures.sql..."
Invoke-SqlFile (Join-Path $here "constraints.sql")
Invoke-SqlFile (Join-Path $here "procedures.sql")
Write-Output "Database is up to date."
