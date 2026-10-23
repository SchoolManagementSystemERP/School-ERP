-- Migration 008: job openings name the campus they are for (shown on the website's Careers page).
SET QUOTED_IDENTIFIER ON;
IF COL_LENGTH(N'dbo.JobOpening', N'campus') IS NULL
  ALTER TABLE [dbo].[JobOpening] ADD [campus] NVARCHAR(150) NULL;
GO
