-- Migration 004: Staff.sensitive (encrypted Aadhaar / PAN).
SET QUOTED_IDENTIFIER ON;
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Staff] ADD [sensitive] NVARCHAR(max);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

