-- Migration 002 — run once on a database created before 22 Oct 2026 (sqlcmd -I or SSMS).
-- Adds Student.profile, the website / recruitment tables, and puts the new tables under row-level security.
-- New installs do not need this: schema.sql and row-level-security.sql already include it.

SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
BEGIN TRAN;

ALTER TABLE [dbo].[Student] ADD [profile] NVARCHAR(max);

CREATE TABLE [dbo].[JobOpening] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [title] NVARCHAR(150) NOT NULL,
    [department] NVARCHAR(100) NOT NULL,
    [category] NVARCHAR(20) NOT NULL,
    [employmentType] NVARCHAR(20) NOT NULL,
    [vacancies] INT NOT NULL,
    [qualification] NVARCHAR(300) NOT NULL,
    [experience] NVARCHAR(200),
    [salary] NVARCHAR(100),
    [description] NVARCHAR(max) NOT NULL,
    [responsibilities] NVARCHAR(max),
    [postedOn] DATE NOT NULL,
    [lastDate] DATE NOT NULL,
    [isOpen] BIT NOT NULL CONSTRAINT [JobOpening_isOpen_df] DEFAULT 1,
    CONSTRAINT [JobOpening_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE TABLE [dbo].[JobApplication] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [jobOpeningId] UNIQUEIDENTIFIER,
    [name] NVARCHAR(150) NOT NULL,
    [email] NVARCHAR(200) NOT NULL,
    [phone] NVARCHAR(20) NOT NULL,
    [qualification] NVARCHAR(300) NOT NULL,
    [experienceYears] INT NOT NULL,
    [currentEmployer] NVARCHAR(150),
    [expectedSalary] NVARCHAR(60),
    [coverLetter] NVARCHAR(max),
    [resumeFileId] UNIQUEIDENTIFIER,
    [status] NVARCHAR(15) NOT NULL CONSTRAINT [JobApplication_status_df] DEFAULT 'APPLIED',
    [interviewDate] DATE,
    [notes] NVARCHAR(1000),
    [appliedAt] DATETIME2 NOT NULL CONSTRAINT [JobApplication_appliedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [JobApplication_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE TABLE [dbo].[ContactMessage] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER,
    [kind] NVARCHAR(15) NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [phone] NVARCHAR(20) NOT NULL,
    [email] NVARCHAR(200),
    [subject] NVARCHAR(200) NOT NULL,
    [message] NVARCHAR(max) NOT NULL,
    [resolved] BIT NOT NULL CONSTRAINT [ContactMessage_resolved_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ContactMessage_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ContactMessage_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE TABLE [dbo].[AlumniMember] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [batchYear] INT NOT NULL,
    [email] NVARCHAR(200) NOT NULL,
    [phone] NVARCHAR(20),
    [occupation] NVARCHAR(150),
    [city] NVARCHAR(100),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AlumniMember_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AlumniMember_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE NONCLUSTERED INDEX [JobOpening_organizationId_branchId_isOpen_idx] ON [dbo].[JobOpening]([organizationId], [branchId], [isOpen]);
CREATE NONCLUSTERED INDEX [JobApplication_organizationId_branchId_status_idx] ON [dbo].[JobApplication]([organizationId], [branchId], [status]);
CREATE NONCLUSTERED INDEX [ContactMessage_organizationId_resolved_createdAt_idx] ON [dbo].[ContactMessage]([organizationId], [resolved], [createdAt]);
CREATE NONCLUSTERED INDEX [AlumniMember_organizationId_batchYear_idx] ON [dbo].[AlumniMember]([organizationId], [batchYear]);

ALTER TABLE [dbo].[JobApplication] ADD CONSTRAINT [JobApplication_jobOpeningId_fkey] FOREIGN KEY ([jobOpeningId]) REFERENCES [dbo].[JobOpening]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT;
GO

ALTER SECURITY POLICY security.TenantIsolation
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[JobOpening],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[JobOpening] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[JobOpening] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[JobApplication],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[JobApplication] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[JobApplication] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[ContactMessage],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[ContactMessage] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[ContactMessage] AFTER UPDATE,
    ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[AlumniMember],
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[AlumniMember] AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[AlumniMember] AFTER UPDATE;
GO
