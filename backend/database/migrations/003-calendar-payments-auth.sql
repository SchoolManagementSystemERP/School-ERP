-- Migration 003: holidays, student transfers, grading scales, online payment orders and webhooks,
-- OTP codes, password reset tokens, product-site demo leads; index on RefreshToken.tokenHash.
-- Generated with: prisma migrate diff --from-schema-datamodel <previous> --to-schema-datamodel prisma/schema.prisma

SET QUOTED_IDENTIFIER ON;
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[PasswordResetToken] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [tokenHash] NVARCHAR(200) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [usedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PasswordResetToken_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PasswordResetToken_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[OtpCode] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [phone] NVARCHAR(20) NOT NULL,
    [purpose] NVARCHAR(15) NOT NULL,
    [codeHash] NVARCHAR(200) NOT NULL,
    [attempts] INT NOT NULL CONSTRAINT [OtpCode_attempts_df] DEFAULT 0,
    [expiresAt] DATETIME2 NOT NULL,
    [usedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [OtpCode_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [OtpCode_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Holiday] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER,
    [academicYearId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [startDate] DATE NOT NULL,
    [endDate] DATE NOT NULL,
    [type] NVARCHAR(10) NOT NULL,
    CONSTRAINT [Holiday_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[StudentTransfer] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [studentId] UNIQUEIDENTIFIER NOT NULL,
    [fromBranchId] UNIQUEIDENTIFIER NOT NULL,
    [toBranchId] UNIQUEIDENTIFIER NOT NULL,
    [academicYearId] UNIQUEIDENTIFIER NOT NULL,
    [transferDate] DATE NOT NULL,
    [reason] NVARCHAR(500),
    [approvedById] UNIQUEIDENTIFIER NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [StudentTransfer_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [StudentTransfer_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[GradingScale] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(60) NOT NULL,
    [bands] NVARCHAR(max) NOT NULL,
    [isDefault] BIT NOT NULL CONSTRAINT [GradingScale_isDefault_df] DEFAULT 0,
    CONSTRAINT [GradingScale_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [GradingScale_organizationId_name_key] UNIQUE NONCLUSTERED ([organizationId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[PaymentOrder] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [studentId] UNIQUEIDENTIFIER NOT NULL,
    [installmentId] UNIQUEIDENTIFIER NOT NULL,
    [amount] DECIMAL(12,2) NOT NULL,
    [lateFee] DECIMAL(12,2) NOT NULL CONSTRAINT [PaymentOrder_lateFee_df] DEFAULT 0,
    [gateway] NVARCHAR(20) NOT NULL,
    [gatewayOrderId] NVARCHAR(100) NOT NULL,
    [status] NVARCHAR(10) NOT NULL,
    [feePaymentId] UNIQUEIDENTIFIER,
    [createdById] UNIQUEIDENTIFIER,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PaymentOrder_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [PaymentOrder_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PaymentOrder_gateway_gatewayOrderId_key] UNIQUE NONCLUSTERED ([gateway],[gatewayOrderId])
);

-- CreateTable
CREATE TABLE [dbo].[PaymentWebhookEvent] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [gateway] NVARCHAR(20) NOT NULL,
    [eventId] NVARCHAR(100) NOT NULL,
    [eventType] NVARCHAR(60) NOT NULL,
    [payload] NVARCHAR(max) NOT NULL,
    [receivedAt] DATETIME2 NOT NULL CONSTRAINT [PaymentWebhookEvent_receivedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [processedAt] DATETIME2,
    [error] NVARCHAR(1000),
    CONSTRAINT [PaymentWebhookEvent_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PaymentWebhookEvent_gateway_eventId_key] UNIQUE NONCLUSTERED ([gateway],[eventId])
);

-- CreateTable
CREATE TABLE [dbo].[DemoLead] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [institution] NVARCHAR(200) NOT NULL,
    [role] NVARCHAR(60),
    [phone] NVARCHAR(20) NOT NULL,
    [email] NVARCHAR(200),
    [city] NVARCHAR(100) NOT NULL,
    [campuses] NVARCHAR(20),
    [students] NVARCHAR(30),
    [message] NVARCHAR(1000),
    [status] NVARCHAR(15) NOT NULL CONSTRAINT [DemoLead_status_df] DEFAULT 'NEW',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DemoLead_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [DemoLead_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PasswordResetToken_tokenHash_idx] ON [dbo].[PasswordResetToken]([tokenHash]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PasswordResetToken_userId_idx] ON [dbo].[PasswordResetToken]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OtpCode_organizationId_phone_createdAt_idx] ON [dbo].[OtpCode]([organizationId], [phone], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Holiday_organizationId_academicYearId_startDate_idx] ON [dbo].[Holiday]([organizationId], [academicYearId], [startDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StudentTransfer_organizationId_studentId_idx] ON [dbo].[StudentTransfer]([organizationId], [studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PaymentOrder_organizationId_studentId_idx] ON [dbo].[PaymentOrder]([organizationId], [studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [DemoLead_status_createdAt_idx] ON [dbo].[DemoLead]([status], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RefreshToken_tokenHash_idx] ON [dbo].[RefreshToken]([tokenHash]);

-- AddForeignKey
ALTER TABLE [dbo].[PasswordResetToken] ADD CONSTRAINT [PasswordResetToken_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

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
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[Holiday],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[Holiday] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[Holiday] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[StudentTransfer],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[StudentTransfer] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[StudentTransfer] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[GradingScale],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[GradingScale] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[GradingScale] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[PaymentOrder],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[PaymentOrder] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[PaymentOrder] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[OtpCode],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[OtpCode] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[OtpCode] AFTER UPDATE;
GO
