-- School ERP — unique-when-set columns. Run after schema.sql.
--
-- A SQL Server UNIQUE constraint allows only one NULL, but these columns are NULL for everyone
-- without a login (most guardians, many staff). Filtered unique indexes keep "one login per
-- person" without that limit. Prisma cannot describe filtered indexes, so they live here.

SET QUOTED_IDENTIFIER ON; -- required for filtered indexes (sqlcmd defaults to OFF)

CREATE UNIQUE NONCLUSTERED INDEX [Staff_userId_key] ON [dbo].[Staff]([userId]) WHERE [userId] IS NOT NULL;
CREATE UNIQUE NONCLUSTERED INDEX [Student_userId_key] ON [dbo].[Student]([userId]) WHERE [userId] IS NOT NULL;
CREATE UNIQUE NONCLUSTERED INDEX [Guardian_userId_key] ON [dbo].[Guardian]([userId]) WHERE [userId] IS NOT NULL;
CREATE UNIQUE NONCLUSTERED INDEX [UX_Vendor_code] ON [dbo].[Vendor]([organizationId], [code]) WHERE [code] IS NOT NULL;
