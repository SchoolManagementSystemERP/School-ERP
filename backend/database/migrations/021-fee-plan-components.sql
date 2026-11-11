IF COL_LENGTH(N'dbo.FeePlan', N'components') IS NULL
  ALTER TABLE [dbo].[FeePlan] ADD [components] NVARCHAR(MAX) NULL;

IF OBJECT_ID(N'dbo.CK_FeePlan_components_json', N'C') IS NULL
  EXEC(N'ALTER TABLE [dbo].[FeePlan] WITH CHECK
    ADD CONSTRAINT [CK_FeePlan_components_json]
    CHECK ([components] IS NULL OR ISJSON([components]) = 1);');
