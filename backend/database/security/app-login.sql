-- School ERP — least-privilege login for the API. Run as an administrator (sqlcmd -E / SSMS):
--   sqlcmd -S localhost -E -C -I -v DatabaseName="school_erp" AppPassword="<strong password>" -i database/security/app-login.sql
-- The API only reads and writes rows. It cannot change tables, permissions or the row-level
-- security policy, so the policy keeps protecting each organization's data even if the API is compromised.

IF SUSER_ID(N'erp_app') IS NULL
  CREATE LOGIN [erp_app] WITH PASSWORD = N'$(AppPassword)', DEFAULT_DATABASE = [$(DatabaseName)], CHECK_POLICY = ON, CHECK_EXPIRATION = OFF;
ELSE
  ALTER LOGIN [erp_app] WITH PASSWORD = N'$(AppPassword)';
GO

USE [$(DatabaseName)];
GO

IF USER_ID(N'erp_app') IS NULL
  CREATE USER [erp_app] FOR LOGIN [erp_app] WITH DEFAULT_SCHEMA = [dbo];
GO

ALTER ROLE db_datareader ADD MEMBER [erp_app];
ALTER ROLE db_datawriter ADD MEMBER [erp_app];
-- Explicitly refuse anything beyond data access.
DENY ALTER ANY SECURITY POLICY TO [erp_app];
DENY ALTER ON SCHEMA::security TO [erp_app];
DENY ALTER ON SCHEMA::dbo TO [erp_app];
DENY VIEW DEFINITION ON SCHEMA::security TO [erp_app];
GO
