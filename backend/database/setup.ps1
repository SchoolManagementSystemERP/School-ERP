<#
  Creates a complete School ERP database from scratch:
    schema.sql -> filtered-unique-indexes.sql -> row-level-security.sql -> constraints.sql -> procedures.sql -> seed.sql
  and records every existing migration as applied (the base scripts already contain them).

    powershell -ExecutionPolicy Bypass -File database\setup.ps1 -Database school_erp -AppPassword "<password for erp_app>"

  -AppPassword also creates / updates the API's least-privilege login (security/app-login.sql).
  Uses Windows authentication with an administrator account. Stops if the database already has tables.
#>
param(
  [string] $Server = "localhost",
  [string] $Database = "school_erp",
  [string] $AppPassword = ""
)
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$sqlcmd = (Get-Command sqlcmd.exe -ErrorAction SilentlyContinue).Source
if (-not $sqlcmd) { $sqlcmd = "C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\SQLCMD.EXE" }

function Run([string[]] $arguments) {
  & $sqlcmd -S $Server -E -C -I -b @arguments
  if ($LASTEXITCODE -ne 0) { throw "Failed: $($arguments -join ' ')" }
}

Run @("-Q", "IF DB_ID(N'$Database') IS NULL CREATE DATABASE [$Database];")
$tables = & $sqlcmd -S $Server -E -C -b -d $Database -W -h -1 -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM sys.tables;"
if ([int]($tables | Select-Object -First 1) -gt 0) { throw "$Database already has tables. Use migrate.ps1 to update it." }

foreach ($file in @("schema.sql", "filtered-unique-indexes.sql", "row-level-security.sql", "constraints.sql", "procedures.sql", "seed.sql")) {
  Write-Output "Running $file..."
  Run @("-d", $Database, "-i", (Join-Path $here $file))
}

$values = (Get-ChildItem (Join-Path $here "migrations") -Filter *.sql | Sort-Object Name | ForEach-Object { "(N'$($_.Name)')" }) -join ", "
$record = "CREATE TABLE dbo.SchemaMigration (name NVARCHAR(200) NOT NULL CONSTRAINT PK_SchemaMigration PRIMARY KEY, appliedAt DATETIME2 NOT NULL CONSTRAINT DF_SchemaMigration_appliedAt DEFAULT SYSUTCDATETIME());"
if ($values) { $record += " INSERT INTO dbo.SchemaMigration (name) VALUES $values;" }
Run @("-d", $Database, "-Q", $record)

if ($AppPassword) {
  Write-Output "Creating the erp_app login..."
  Run @("-v", "DatabaseName=$Database", "AppPassword=$AppPassword", "-i", (Join-Path $here "security\app-login.sql"))
  Run @("-d", $Database, "-i", (Join-Path $here "procedures.sql"))  # grants EXECUTE now that erp_app exists
}
Write-Output "Database $Database is ready."
