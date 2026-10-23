-- Migration 009: files sent from the public website (job applicants' resumes) have no uploading user.
-- The foreign key and index on uploadedById are dropped here and re-created by constraints.sql.
SET QUOTED_IDENTIFIER ON;
IF OBJECT_ID(N'dbo.FK_Attachment_uploadedById', N'F') IS NOT NULL ALTER TABLE [dbo].[Attachment] DROP CONSTRAINT [FK_Attachment_uploadedById];
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Attachment_uploadedById' AND object_id = OBJECT_ID(N'dbo.Attachment')) DROP INDEX [IX_Attachment_uploadedById] ON [dbo].[Attachment];
ALTER TABLE [dbo].[Attachment] ALTER COLUMN [uploadedById] UNIQUEIDENTIFIER NULL;
GO
