-- Migration 006: procurement (indent → HOD → store → principal / management → quotation → PO → GRN → bill → payment),
-- vendors and petty cash; row-level security for the new tables; the new permissions and who gets them.
SET QUOTED_IDENTIFIER ON;
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Vendor] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [category] NVARCHAR(100),
    [gstin] NVARCHAR(15),
    [pan] NVARCHAR(10),
    [phone] NVARCHAR(20),
    [email] NVARCHAR(200),
    [address] NVARCHAR(500),
    [bankAccount] NVARCHAR(max),
    [tdsSection] NVARCHAR(5) NOT NULL CONSTRAINT [Vendor_tdsSection_df] DEFAULT '194C',
    [isIndividual] BIT NOT NULL CONSTRAINT [Vendor_isIndividual_df] DEFAULT 0,
    [isActive] BIT NOT NULL CONSTRAINT [Vendor_isActive_df] DEFAULT 1,
    CONSTRAINT [Vendor_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Vendor_organizationId_name_key] UNIQUE NONCLUSTERED ([organizationId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[Indent] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [no] NVARCHAR(30) NOT NULL,
    [requestedById] UNIQUEIDENTIFIER NOT NULL,
    [requesterName] NVARCHAR(150) NOT NULL,
    [department] NVARCHAR(100) NOT NULL,
    [location] NVARCHAR(150) NOT NULL,
    [purpose] NVARCHAR(1000) NOT NULL,
    [priority] NVARCHAR(10) NOT NULL CONSTRAINT [Indent_priority_df] DEFAULT 'NORMAL',
    [neededBy] DATE NOT NULL,
    [status] NVARCHAR(25) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Indent_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Indent_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Indent_organizationId_no_key] UNIQUE NONCLUSTERED ([organizationId],[no])
);

-- CreateTable
CREATE TABLE [dbo].[IndentLine] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [indentId] UNIQUEIDENTIFIER NOT NULL,
    [lineNo] INT NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [qty] INT NOT NULL,
    [unit] NVARCHAR(20) NOT NULL,
    [estRate] DECIMAL(12,2) NOT NULL,
    [inventoryItemId] UNIQUEIDENTIFIER,
    [category] NVARCHAR(60),
    [issuedFromStock] INT,
    [toPurchase] INT,
    CONSTRAINT [IndentLine_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [IndentLine_indentId_lineNo_key] UNIQUE NONCLUSTERED ([indentId],[lineNo])
);

-- CreateTable
CREATE TABLE [dbo].[IndentEvent] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [indentId] UNIQUEIDENTIFIER NOT NULL,
    [at] DATETIME2 NOT NULL CONSTRAINT [IndentEvent_at_df] DEFAULT CURRENT_TIMESTAMP,
    [byUserId] UNIQUEIDENTIFIER,
    [byName] NVARCHAR(150) NOT NULL,
    [role] NVARCHAR(20) NOT NULL,
    [action] NVARCHAR(100) NOT NULL,
    [remark] NVARCHAR(1000),
    CONSTRAINT [IndentEvent_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Quotation] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [indentId] UNIQUEIDENTIFIER NOT NULL,
    [vendorId] UNIQUEIDENTIFIER NOT NULL,
    [gstPercent] DECIMAL(5,2) NOT NULL,
    [deliveryDays] INT NOT NULL,
    [validTill] DATE NOT NULL,
    [notes] NVARCHAR(500),
    [receivedAt] DATETIME2 NOT NULL CONSTRAINT [Quotation_receivedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Quotation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Quotation_indentId_vendorId_key] UNIQUE NONCLUSTERED ([indentId],[vendorId])
);

-- CreateTable
CREATE TABLE [dbo].[QuotationLine] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [quotationId] UNIQUEIDENTIFIER NOT NULL,
    [lineNo] INT NOT NULL,
    [rate] DECIMAL(12,2) NOT NULL,
    CONSTRAINT [QuotationLine_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [QuotationLine_quotationId_lineNo_key] UNIQUE NONCLUSTERED ([quotationId],[lineNo])
);

-- CreateTable
CREATE TABLE [dbo].[PurchaseOrder] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [no] NVARCHAR(30) NOT NULL,
    [indentId] UNIQUEIDENTIFIER NOT NULL,
    [vendorId] UNIQUEIDENTIFIER NOT NULL,
    [quotationId] UNIQUEIDENTIFIER NOT NULL,
    [orderDate] DATE NOT NULL,
    [deliveryBy] DATE NOT NULL,
    [gstPercent] DECIMAL(5,2) NOT NULL,
    [status] NVARCHAR(20) NOT NULL,
    [selectionNote] NVARCHAR(500),
    [createdById] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [PurchaseOrder_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PurchaseOrder_organizationId_no_key] UNIQUE NONCLUSTERED ([organizationId],[no])
);

-- CreateTable
CREATE TABLE [dbo].[PurchaseOrderLine] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [poId] UNIQUEIDENTIFIER NOT NULL,
    [lineNo] INT NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [qty] INT NOT NULL,
    [unit] NVARCHAR(20) NOT NULL,
    [rate] DECIMAL(12,2) NOT NULL,
    [received] INT NOT NULL CONSTRAINT [PurchaseOrderLine_received_df] DEFAULT 0,
    [accepted] INT NOT NULL CONSTRAINT [PurchaseOrderLine_accepted_df] DEFAULT 0,
    CONSTRAINT [PurchaseOrderLine_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PurchaseOrderLine_poId_lineNo_key] UNIQUE NONCLUSTERED ([poId],[lineNo])
);

-- CreateTable
CREATE TABLE [dbo].[GoodsReceipt] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [no] NVARCHAR(30) NOT NULL,
    [poId] UNIQUEIDENTIFIER NOT NULL,
    [receivedOn] DATE NOT NULL,
    [receivedById] UNIQUEIDENTIFIER NOT NULL,
    [checkedBy] NVARCHAR(150) NOT NULL,
    [challanNo] NVARCHAR(60) NOT NULL,
    CONSTRAINT [GoodsReceipt_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [GoodsReceipt_organizationId_no_key] UNIQUE NONCLUSTERED ([organizationId],[no])
);

-- CreateTable
CREATE TABLE [dbo].[GoodsReceiptLine] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [grnId] UNIQUEIDENTIFIER NOT NULL,
    [lineNo] INT NOT NULL,
    [received] INT NOT NULL,
    [accepted] INT NOT NULL,
    [rejectedReason] NVARCHAR(300),
    CONSTRAINT [GoodsReceiptLine_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [GoodsReceiptLine_grnId_lineNo_key] UNIQUE NONCLUSTERED ([grnId],[lineNo])
);

-- CreateTable
CREATE TABLE [dbo].[VendorBill] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [poId] UNIQUEIDENTIFIER NOT NULL,
    [vendorId] UNIQUEIDENTIFIER NOT NULL,
    [billNo] NVARCHAR(60) NOT NULL,
    [billDate] DATE NOT NULL,
    [subtotal] DECIMAL(12,2) NOT NULL,
    [gst] DECIMAL(12,2) NOT NULL,
    [total] DECIMAL(12,2) NOT NULL,
    [expected] DECIMAL(12,2) NOT NULL,
    [status] NVARCHAR(10) NOT NULL,
    [note] NVARCHAR(500),
    [enteredById] UNIQUEIDENTIFIER NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [VendorBill_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [VendorBill_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [VendorBill_vendorId_billNo_key] UNIQUE NONCLUSTERED ([vendorId],[billNo])
);

-- CreateTable
CREATE TABLE [dbo].[VendorPayment] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [billId] UNIQUEIDENTIFIER NOT NULL,
    [vendorId] UNIQUEIDENTIFIER NOT NULL,
    [paidOn] DATE NOT NULL,
    [gross] DECIMAL(12,2) NOT NULL,
    [tdsSection] NVARCHAR(5) NOT NULL,
    [tds] DECIMAL(12,2) NOT NULL,
    [net] DECIMAL(12,2) NOT NULL,
    [mode] NVARCHAR(10) NOT NULL,
    [reference] NVARCHAR(60) NOT NULL,
    [expenseId] UNIQUEIDENTIFIER,
    [paidById] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [VendorPayment_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [VendorPayment_billId_key] UNIQUE NONCLUSTERED ([billId])
);

-- CreateTable
CREATE TABLE [dbo].[PettyCashVoucher] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [voucherDate] DATE NOT NULL,
    [kind] NVARCHAR(6) NOT NULL,
    [purpose] NVARCHAR(300) NOT NULL,
    [paidTo] NVARCHAR(150) NOT NULL,
    [category] NVARCHAR(40),
    [amount] DECIMAL(10,2) NOT NULL,
    [expenseId] UNIQUEIDENTIFIER,
    [approvedById] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [PettyCashVoucher_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Indent_organizationId_branchId_status_idx] ON [dbo].[Indent]([organizationId], [branchId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IndentEvent_indentId_at_idx] ON [dbo].[IndentEvent]([indentId], [at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PurchaseOrder_organizationId_branchId_status_idx] ON [dbo].[PurchaseOrder]([organizationId], [branchId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [VendorBill_organizationId_branchId_status_idx] ON [dbo].[VendorBill]([organizationId], [branchId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [VendorPayment_organizationId_branchId_paidOn_idx] ON [dbo].[VendorPayment]([organizationId], [branchId], [paidOn]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PettyCashVoucher_organizationId_branchId_voucherDate_idx] ON [dbo].[PettyCashVoucher]([organizationId], [branchId], [voucherDate]);

-- AddForeignKey
ALTER TABLE [dbo].[IndentLine] ADD CONSTRAINT [IndentLine_indentId_fkey] FOREIGN KEY ([indentId]) REFERENCES [dbo].[Indent]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[IndentEvent] ADD CONSTRAINT [IndentEvent_indentId_fkey] FOREIGN KEY ([indentId]) REFERENCES [dbo].[Indent]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[QuotationLine] ADD CONSTRAINT [QuotationLine_quotationId_fkey] FOREIGN KEY ([quotationId]) REFERENCES [dbo].[Quotation]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PurchaseOrderLine] ADD CONSTRAINT [PurchaseOrderLine_poId_fkey] FOREIGN KEY ([poId]) REFERENCES [dbo].[PurchaseOrder]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GoodsReceiptLine] ADD CONSTRAINT [GoodsReceiptLine_grnId_fkey] FOREIGN KEY ([grnId]) REFERENCES [dbo].[GoodsReceipt]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
GO

ALTER SECURITY POLICY security.TenantIsolation
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[Vendor],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[Vendor] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[Vendor] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[Indent],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[Indent] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[Indent] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[IndentLine],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[IndentLine] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[IndentLine] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[IndentEvent],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[IndentEvent] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[IndentEvent] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[Quotation],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[Quotation] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[Quotation] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[QuotationLine],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[QuotationLine] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[QuotationLine] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[PurchaseOrder],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[PurchaseOrder] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[PurchaseOrder] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[PurchaseOrderLine],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[PurchaseOrderLine] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[PurchaseOrderLine] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[GoodsReceipt],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[GoodsReceipt] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[GoodsReceipt] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[GoodsReceiptLine],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[GoodsReceiptLine] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[GoodsReceiptLine] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[VendorBill],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[VendorBill] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[VendorBill] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[VendorPayment],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[VendorPayment] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[VendorPayment] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[PettyCashVoucher],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[PettyCashVoucher] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[PettyCashVoucher] AFTER UPDATE;
GO

SET NOCOUNT ON;
EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = 1;
INSERT INTO dbo.Permission (code, module, description)
SELECT v.code, v.module, v.description FROM (VALUES
  (N'procurement.request', N'procurement', N'Raise requisitions for items'),
  (N'procurement.store', N'procurement', N'Store check, quotations, purchase orders and goods receipt'),
  (N'procurement.approve', N'procurement', N'Approve purchases up to the principal''s limit'),
  (N'procurement.approve_management', N'procurement', N'Approve purchases above the principal''s limit'),
  (N'payables.manage', N'accounts', N'Vendor bills, vendor payments and petty cash')
) v(code, module, description)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Permission p WHERE p.code = v.code);

INSERT INTO dbo.RolePermission (organizationId, roleId, permissionCode)
SELECT NULL, r.id, g.perm FROM (VALUES (N'TEACHER', N'procurement.request'), (N'VICE_PRINCIPAL', N'procurement.request'), (N'PRINCIPAL', N'procurement.request'), (N'LIBRARIAN', N'procurement.request'), (N'TRANSPORT_MANAGER', N'procurement.request'), (N'HOSTEL_WARDEN', N'procurement.request'), (N'RECEPTIONIST', N'procurement.request'), (N'EXAM_CONTROLLER', N'procurement.request'), (N'HR', N'procurement.request'), (N'INVENTORY_MANAGER', N'procurement.request'), (N'ACCOUNTANT', N'procurement.request'), (N'INVENTORY_MANAGER', N'procurement.store'), (N'PRINCIPAL', N'procurement.approve'), (N'GROUP_OWNER', N'procurement.approve_management'), (N'FINANCE_HEAD', N'procurement.approve_management'), (N'ACCOUNTANT', N'payables.manage')) g(role, perm)
JOIN dbo.Role r ON r.code = g.role AND r.organizationId IS NULL
WHERE NOT EXISTS (SELECT 1 FROM dbo.RolePermission rp WHERE rp.roleId = r.id AND rp.permissionCode = g.perm);
PRINT CONCAT('role permissions added: ', @@ROWCOUNT);
EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = 0;
GO
