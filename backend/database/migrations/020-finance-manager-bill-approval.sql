IF COL_LENGTH(N'dbo.VendorBill', N'payablesApprovedById') IS NULL
  ALTER TABLE [dbo].[VendorBill] ADD [payablesApprovedById] UNIQUEIDENTIFIER NULL;

IF OBJECT_ID(N'dbo.FK_VendorBill_payablesApprovedById', N'F') IS NULL
  ALTER TABLE [dbo].[VendorBill] WITH CHECK
    ADD CONSTRAINT [FK_VendorBill_payablesApprovedById]
    FOREIGN KEY ([payablesApprovedById]) REFERENCES [dbo].[User] ([id]);

IF OBJECT_ID(N'dbo.CK_VendorBill_status', N'C') IS NOT NULL
  ALTER TABLE [dbo].[VendorBill] DROP CONSTRAINT [CK_VendorBill_status];
ALTER TABLE [dbo].[VendorBill] WITH CHECK
  ADD CONSTRAINT [CK_VendorBill_status]
  CHECK ([status] IN (N'MATCHED', N'MISMATCH', N'FIN_REVIEW', N'APPROVED', N'PAID', N'ON_HOLD'));
