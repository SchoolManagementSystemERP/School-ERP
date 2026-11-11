CREATE OR ALTER TRIGGER dbo.TR_AuditLog_Immutable
ON dbo.AuditLog
INSTEAD OF UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;
  THROW 51000, 'AuditLog records are immutable.', 1;
END;
GO
