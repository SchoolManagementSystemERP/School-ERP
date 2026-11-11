-- Jarvis remembers each user's conversation (questions and replies), so it survives a refresh,
-- logout or another device. Only the signed-in user's own messages are read back; the API deletes
-- them after ASSISTANT_MEMORY_MINUTES (1 hour by default), keeps at most 500 per user, and the user
-- can clear them.
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRAN;

  IF OBJECT_ID(N'dbo.AssistantMessage', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.AssistantMessage (
      [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [AssistantMessage_pkey] PRIMARY KEY CLUSTERED,
      [organizationId] UNIQUEIDENTIFIER NOT NULL,
      [userId] UNIQUEIDENTIFIER NOT NULL,
      [role] NVARCHAR(10) NOT NULL,
      [content] NVARCHAR(4000) NOT NULL,
      [source] NVARCHAR(60) NULL,
      [createdAt] DATETIME2 NOT NULL CONSTRAINT [AssistantMessage_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT [CK_AssistantMessage_role] CHECK ([role] IN (N'user', N'assistant')),
      CONSTRAINT [FK_AssistantMessage_userId] FOREIGN KEY ([userId]) REFERENCES dbo.[User]([id])
    );
    CREATE NONCLUSTERED INDEX [AssistantMessage_organizationId_userId_createdAt_idx]
      ON dbo.AssistantMessage([organizationId], [userId], [createdAt]);
  END;

  COMMIT TRAN;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  THROW;
END CATCH;
GO

ALTER SECURITY POLICY security.TenantIsolation
  ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[AssistantMessage],
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[AssistantMessage] AFTER INSERT,
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[AssistantMessage] AFTER UPDATE;
GO
