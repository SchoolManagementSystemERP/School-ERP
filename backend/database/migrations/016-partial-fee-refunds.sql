IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UX_FeeRefund_paymentId'
    AND object_id = OBJECT_ID(N'dbo.FeeRefund')
)
  DROP INDEX [UX_FeeRefund_paymentId] ON [dbo].[FeeRefund];
