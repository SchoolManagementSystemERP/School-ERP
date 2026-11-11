-- Things a person asks Jarvis to remember ("yaad rakho meri class 10 B hai") — kept until they say
-- "bhool jao". Unlike the conversation (AssistantMessage, deleted after a few minutes) these stay.
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRAN;

  IF OBJECT_ID(N'dbo.AssistantNote', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.AssistantNote (
      [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [AssistantNote_pkey] PRIMARY KEY CLUSTERED,
      [organizationId] UNIQUEIDENTIFIER NOT NULL,
      [userId] UNIQUEIDENTIFIER NOT NULL,
      [key] NVARCHAR(40) NOT NULL,
      [value] NVARCHAR(500) NOT NULL,
      [updatedAt] DATETIME2 NOT NULL CONSTRAINT [AssistantNote_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT [AssistantNote_userId_key_key] UNIQUE ([userId], [key]),
      CONSTRAINT [FK_AssistantNote_userId] FOREIGN KEY ([userId]) REFERENCES dbo.[User]([id])
    );
    CREATE NONCLUSTERED INDEX [AssistantNote_organizationId_userId_idx] ON dbo.AssistantNote([organizationId], [userId]);
  END;

  COMMIT TRAN;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  THROW;
END CATCH;
GO

ALTER SECURITY POLICY security.TenantIsolation
  ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[AssistantNote],
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[AssistantNote] AFTER INSERT,
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[AssistantNote] AFTER UPDATE;
GO
