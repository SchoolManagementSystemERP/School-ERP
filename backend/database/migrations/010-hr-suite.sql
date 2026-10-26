-- Migration 010: HR suite — staff attendance, expense claims, interview rounds, offers (CTC annexure),
-- onboarding checklist, training (L&D) with question bank and enrolments, separations (exit / full & final);
-- staff compensation and background-verification status; candidate source and screening; vendor codes.
SET QUOTED_IDENTIFIER ON;
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Staff] ADD [bgvStatus] NVARCHAR(12),
[compensation] NVARCHAR(max);

-- AlterTable
ALTER TABLE [dbo].[Vendor] ADD [code] NVARCHAR(20);

-- AlterTable
ALTER TABLE [dbo].[JobApplication] ADD [screeningNotes] NVARCHAR(1000),
[screeningScore] INT,
[source] NVARCHAR(30);

-- CreateTable
CREATE TABLE [dbo].[StaffAttendance] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [staffId] UNIQUEIDENTIFIER NOT NULL,
    [date] DATE NOT NULL,
    [status] NVARCHAR(10) NOT NULL,
    [inTime] NVARCHAR(5),
    [outTime] NVARCHAR(5),
    [markedById] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [StaffAttendance_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [StaffAttendance_staffId_date_key] UNIQUE NONCLUSTERED ([staffId],[date])
);

-- CreateTable
CREATE TABLE [dbo].[ExpenseClaim] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [staffId] UNIQUEIDENTIFIER NOT NULL,
    [claimNo] NVARCHAR(30) NOT NULL,
    [date] DATE NOT NULL,
    [category] NVARCHAR(40) NOT NULL,
    [description] NVARCHAR(300) NOT NULL,
    [amount] DECIMAL(12,2) NOT NULL,
    [receiptName] NVARCHAR(260),
    [status] NVARCHAR(12) NOT NULL CONSTRAINT [ExpenseClaim_status_df] DEFAULT 'SUBMITTED',
    [decidedById] UNIQUEIDENTIFIER,
    [decidedAt] DATETIME2,
    [remark] NVARCHAR(300),
    [paidMonth] NVARCHAR(7),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ExpenseClaim_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ExpenseClaim_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ExpenseClaim_organizationId_claimNo_key] UNIQUE NONCLUSTERED ([organizationId],[claimNo])
);

-- CreateTable
CREATE TABLE [dbo].[InterviewRound] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [applicationId] UNIQUEIDENTIFIER NOT NULL,
    [roundNo] INT NOT NULL,
    [title] NVARCHAR(60) NOT NULL,
    [mode] NVARCHAR(15) NOT NULL,
    [scheduledAt] DATETIME2 NOT NULL,
    [interviewer] NVARCHAR(150) NOT NULL,
    [rating] INT,
    [feedback] NVARCHAR(1000),
    [result] NVARCHAR(10) NOT NULL CONSTRAINT [InterviewRound_result_df] DEFAULT 'PENDING',
    CONSTRAINT [InterviewRound_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [InterviewRound_applicationId_roundNo_key] UNIQUE NONCLUSTERED ([applicationId],[roundNo])
);

-- CreateTable
CREATE TABLE [dbo].[JobOffer] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [applicationId] UNIQUEIDENTIFIER NOT NULL,
    [letterNo] NVARCHAR(30) NOT NULL,
    [designation] NVARCHAR(100) NOT NULL,
    [department] NVARCHAR(100) NOT NULL,
    [staffType] NVARCHAR(15) NOT NULL,
    [employmentType] NVARCHAR(20) NOT NULL,
    [joiningDate] DATE NOT NULL,
    [validTill] DATE NOT NULL,
    [ctcAnnual] DECIMAL(12,2) NOT NULL,
    [breakdown] NVARCHAR(max) NOT NULL,
    [status] NVARCHAR(12) NOT NULL CONSTRAINT [JobOffer_status_df] DEFAULT 'DRAFT',
    [staffId] UNIQUEIDENTIFIER,
    [createdById] UNIQUEIDENTIFIER NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [JobOffer_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [respondedAt] DATETIME2,
    CONSTRAINT [JobOffer_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [JobOffer_organizationId_letterNo_key] UNIQUE NONCLUSTERED ([organizationId],[letterNo])
);

-- CreateTable
CREATE TABLE [dbo].[OnboardingTask] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [staffId] UNIQUEIDENTIFIER NOT NULL,
    [taskKey] NVARCHAR(40) NOT NULL,
    [title] NVARCHAR(150) NOT NULL,
    [category] NVARCHAR(15) NOT NULL,
    [sortOrder] INT NOT NULL,
    [done] BIT NOT NULL CONSTRAINT [OnboardingTask_done_df] DEFAULT 0,
    [doneAt] DATETIME2,
    [doneById] UNIQUEIDENTIFIER,
    [note] NVARCHAR(300),
    CONSTRAINT [OnboardingTask_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [OnboardingTask_staffId_taskKey_key] UNIQUE NONCLUSTERED ([staffId],[taskKey])
);

-- CreateTable
CREATE TABLE [dbo].[Training] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [title] NVARCHAR(200) NOT NULL,
    [category] NVARCHAR(15) NOT NULL,
    [description] NVARCHAR(2000),
    [trainerName] NVARCHAR(150) NOT NULL,
    [trainerStaffId] UNIQUEIDENTIFIER,
    [mode] NVARCHAR(10) NOT NULL,
    [venue] NVARCHAR(150),
    [startDate] DATE NOT NULL,
    [endDate] DATE NOT NULL,
    [durationHours] DECIMAL(5,1) NOT NULL,
    [slides] NVARCHAR(max),
    [passPercent] INT NOT NULL CONSTRAINT [Training_passPercent_df] DEFAULT 60,
    [status] NVARCHAR(10) NOT NULL CONSTRAINT [Training_status_df] DEFAULT 'PLANNED',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Training_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Training_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[TrainingQuestion] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [trainingId] UNIQUEIDENTIFIER NOT NULL,
    [sortOrder] INT NOT NULL,
    [question] NVARCHAR(500) NOT NULL,
    [options] NVARCHAR(max) NOT NULL,
    [answerIndex] INT NOT NULL,
    CONSTRAINT [TrainingQuestion_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[TrainingEnrollment] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [trainingId] UNIQUEIDENTIFIER NOT NULL,
    [staffId] UNIQUEIDENTIFIER NOT NULL,
    [preScore] DECIMAL(5,2),
    [postScore] DECIMAL(5,2),
    [attended] BIT NOT NULL CONSTRAINT [TrainingEnrollment_attended_df] DEFAULT 0,
    [completedAt] DATETIME2,
    [rating] INT,
    [feedback] NVARCHAR(500),
    CONSTRAINT [TrainingEnrollment_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [TrainingEnrollment_trainingId_staffId_key] UNIQUE NONCLUSTERED ([trainingId],[staffId])
);

-- CreateTable
CREATE TABLE [dbo].[Separation] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [staffId] UNIQUEIDENTIFIER NOT NULL,
    [type] NVARCHAR(15) NOT NULL,
    [noticeDate] DATE NOT NULL,
    [lastWorkingDay] DATE NOT NULL,
    [reason] NVARCHAR(500) NOT NULL,
    [letter] NVARCHAR(max),
    [status] NVARCHAR(12) NOT NULL CONSTRAINT [Separation_status_df] DEFAULT 'REQUESTED',
    [exitInterview] NVARCHAR(max),
    [handover] NVARCHAR(max),
    [fnf] NVARCHAR(max),
    [expenseId] UNIQUEIDENTIFIER,
    [acceptedById] UNIQUEIDENTIFIER,
    [settledAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Separation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Separation_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StaffAttendance_organizationId_branchId_date_idx] ON [dbo].[StaffAttendance]([organizationId], [branchId], [date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ExpenseClaim_organizationId_branchId_status_idx] ON [dbo].[ExpenseClaim]([organizationId], [branchId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ExpenseClaim_staffId_idx] ON [dbo].[ExpenseClaim]([staffId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [JobOffer_applicationId_idx] ON [dbo].[JobOffer]([applicationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Training_organizationId_branchId_startDate_idx] ON [dbo].[Training]([organizationId], [branchId], [startDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [TrainingQuestion_trainingId_idx] ON [dbo].[TrainingQuestion]([trainingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Separation_organizationId_branchId_status_idx] ON [dbo].[Separation]([organizationId], [branchId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Separation_staffId_idx] ON [dbo].[Separation]([staffId]);

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
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[StaffAttendance],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[StaffAttendance] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[StaffAttendance] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[ExpenseClaim],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[ExpenseClaim] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[ExpenseClaim] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[InterviewRound],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[InterviewRound] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[InterviewRound] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[JobOffer],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[JobOffer] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[JobOffer] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[OnboardingTask],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[OnboardingTask] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[OnboardingTask] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[Training],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[Training] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[Training] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[TrainingQuestion],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[TrainingQuestion] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[TrainingQuestion] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[TrainingEnrollment],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[TrainingEnrollment] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[TrainingEnrollment] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[Separation],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[Separation] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[Separation] AFTER UPDATE;
GO

-- Vendor codes: unique per organization when set; existing vendors get V-0001, V-0002… by name.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Vendor_code' AND object_id = OBJECT_ID(N'dbo.Vendor'))
  CREATE UNIQUE NONCLUSTERED INDEX [UX_Vendor_code] ON [dbo].[Vendor] ([organizationId], [code]) WHERE [code] IS NOT NULL;
GO
EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = 1;
WITH numbered AS (
  SELECT id, code, ROW_NUMBER() OVER (PARTITION BY organizationId ORDER BY name) AS n FROM dbo.Vendor
)
UPDATE numbered SET code = CONCAT(N'V-', RIGHT(CONCAT(N'0000', n), 4)) WHERE code IS NULL;
EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = 0;
GO
