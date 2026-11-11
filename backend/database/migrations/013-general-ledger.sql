-- Phase 1 of Accounts: tenant-scoped chart of accounts and immutable journal vouchers.
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
BEGIN TRY
  BEGIN TRAN;

  IF OBJECT_ID(N'dbo.LedgerAccount', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.LedgerAccount (
      id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_LedgerAccount PRIMARY KEY,
      organizationId UNIQUEIDENTIFIER NOT NULL,
      branchId UNIQUEIDENTIFIER NOT NULL,
      code NVARCHAR(20) NOT NULL,
      name NVARCHAR(120) NOT NULL,
      category NVARCHAR(20) NOT NULL,
      parentId UNIQUEIDENTIFIER NULL,
      isSystem BIT NOT NULL CONSTRAINT DF_LedgerAccount_isSystem DEFAULT 0,
      isActive BIT NOT NULL CONSTRAINT DF_LedgerAccount_isActive DEFAULT 1,
      createdAt DATETIME2 NOT NULL CONSTRAINT DF_LedgerAccount_createdAt DEFAULT SYSUTCDATETIME(),
      CONSTRAINT UQ_LedgerAccount_branchId_code UNIQUE (branchId, code),
      CONSTRAINT CK_LedgerAccount_category CHECK (category IN (N'ASSET', N'LIABILITY', N'INCOME', N'EXPENSE', N'EQUITY')),
      CONSTRAINT FK_LedgerAccount_organizationId FOREIGN KEY (organizationId) REFERENCES dbo.Organization(id),
      CONSTRAINT FK_LedgerAccount_branchId FOREIGN KEY (branchId) REFERENCES dbo.Branch(id),
      CONSTRAINT FK_LedgerAccount_parentId FOREIGN KEY (parentId) REFERENCES dbo.LedgerAccount(id)
    );
    CREATE NONCLUSTERED INDEX IX_LedgerAccount_org_branch_category_active
      ON dbo.LedgerAccount(organizationId, branchId, category, isActive);
  END;

  IF OBJECT_ID(N'dbo.JournalEntry', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.JournalEntry (
      id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_JournalEntry PRIMARY KEY,
      organizationId UNIQUEIDENTIFIER NOT NULL,
      branchId UNIQUEIDENTIFIER NOT NULL,
      entryNo NVARCHAR(40) NOT NULL,
      entryDate DATE NOT NULL,
      description NVARCHAR(300) NOT NULL,
      sourceType NVARCHAR(30) NOT NULL CONSTRAINT DF_JournalEntry_sourceType DEFAULT N'MANUAL',
      sourceId NVARCHAR(60) NULL,
      createdById UNIQUEIDENTIFIER NOT NULL,
      createdAt DATETIME2 NOT NULL CONSTRAINT DF_JournalEntry_createdAt DEFAULT SYSUTCDATETIME(),
      CONSTRAINT UQ_JournalEntry_branchId_entryNo UNIQUE (branchId, entryNo),
      CONSTRAINT FK_JournalEntry_organizationId FOREIGN KEY (organizationId) REFERENCES dbo.Organization(id),
      CONSTRAINT FK_JournalEntry_branchId FOREIGN KEY (branchId) REFERENCES dbo.Branch(id),
      CONSTRAINT FK_JournalEntry_createdById FOREIGN KEY (createdById) REFERENCES dbo.[User](id)
    );
    CREATE NONCLUSTERED INDEX IX_JournalEntry_org_branch_entryDate
      ON dbo.JournalEntry(organizationId, branchId, entryDate);
  END;

  IF OBJECT_ID(N'dbo.JournalLine', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.JournalLine (
      id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_JournalLine PRIMARY KEY,
      organizationId UNIQUEIDENTIFIER NOT NULL,
      journalEntryId UNIQUEIDENTIFIER NOT NULL,
      accountId UNIQUEIDENTIFIER NOT NULL,
      description NVARCHAR(200) NULL,
      debit DECIMAL(12,2) NOT NULL CONSTRAINT DF_JournalLine_debit DEFAULT 0,
      credit DECIMAL(12,2) NOT NULL CONSTRAINT DF_JournalLine_credit DEFAULT 0,
      CONSTRAINT CK_JournalLine_amounts CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
      CONSTRAINT FK_JournalLine_organizationId FOREIGN KEY (organizationId) REFERENCES dbo.Organization(id),
      CONSTRAINT FK_JournalLine_journalEntryId FOREIGN KEY (journalEntryId) REFERENCES dbo.JournalEntry(id),
      CONSTRAINT FK_JournalLine_accountId FOREIGN KEY (accountId) REFERENCES dbo.LedgerAccount(id)
    );
    CREATE NONCLUSTERED INDEX IX_JournalLine_org_account ON dbo.JournalLine(organizationId, accountId);
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.Permission WHERE code = N'accounting.read')
    INSERT INTO dbo.Permission (code, module, description) VALUES (N'accounting.read', N'accounts', N'View chart of accounts, journals and financial statements');
  IF NOT EXISTS (SELECT 1 FROM dbo.Permission WHERE code = N'accounting.manage')
    INSERT INTO dbo.Permission (code, module, description) VALUES (N'accounting.manage', N'accounts', N'Manage chart of accounts and post journal vouchers');

  EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = 1;
  INSERT INTO dbo.RolePermission (organizationId, roleId, permissionCode)
  SELECT NULL, r.id, p.permissionCode
  FROM (VALUES
    (N'ACCOUNTANT', N'accounting.read'), (N'ACCOUNTANT', N'accounting.manage'),
    (N'FINANCE_HEAD', N'accounting.read'), (N'FINANCE_HEAD', N'accounting.manage'),
    (N'PRINCIPAL', N'accounting.read'), (N'GROUP_OWNER', N'accounting.read'),
    (N'GROUP_ADMIN', N'accounting.read'), (N'REGIONAL_ACCOUNTS_OFFICER', N'accounting.read'),
    (N'REGIONAL_AUDITOR', N'accounting.read'), (N'TREASURER', N'accounting.read')
  ) p(roleCode, permissionCode)
  JOIN dbo.Role r ON r.code = p.roleCode AND r.organizationId IS NULL
  WHERE NOT EXISTS (SELECT 1 FROM dbo.RolePermission rp WHERE rp.roleId = r.id AND rp.permissionCode = p.permissionCode);
  EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = 0;

  COMMIT TRAN;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  THROW;
END CATCH;
GO

ALTER SECURITY POLICY security.TenantIsolation
  ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[LedgerAccount],
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[LedgerAccount] AFTER INSERT,
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[LedgerAccount] AFTER UPDATE,
  ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[JournalEntry],
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[JournalEntry] AFTER INSERT,
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[JournalEntry] AFTER UPDATE,
  ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[JournalLine],
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[JournalLine] AFTER INSERT,
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[JournalLine] AFTER UPDATE;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_JournalEntry_source' AND object_id = OBJECT_ID(N'dbo.JournalEntry'))
  CREATE UNIQUE NONCLUSTERED INDEX UX_JournalEntry_source
    ON dbo.JournalEntry(organizationId, branchId, sourceType, sourceId)
    WHERE sourceId IS NOT NULL;
GO
