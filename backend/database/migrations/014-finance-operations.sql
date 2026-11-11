-- Fees: full refunds. Finance controls: bank imports, departmental budgets and restricted grants.
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
BEGIN TRY
  BEGIN TRAN;

  IF COL_LENGTH(N'dbo.Expense', N'department') IS NULL
    ALTER TABLE dbo.Expense ADD department NVARCHAR(100) NULL;
  IF COL_LENGTH(N'dbo.Expense', N'grantFundId') IS NULL
    ALTER TABLE dbo.Expense ADD grantFundId UNIQUEIDENTIFIER NULL;

  IF OBJECT_ID(N'dbo.FeeRefund', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.FeeRefund (
      id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_FeeRefund PRIMARY KEY,
      organizationId UNIQUEIDENTIFIER NOT NULL,
      branchId UNIQUEIDENTIFIER NOT NULL,
      paymentId UNIQUEIDENTIFIER NOT NULL,
      refundNo NVARCHAR(40) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      method NVARCHAR(20) NOT NULL,
      reason NVARCHAR(300) NOT NULL,
      reference NVARCHAR(100) NULL,
      refundedAt DATETIME2 NOT NULL,
      refundedById UNIQUEIDENTIFIER NOT NULL,
      CONSTRAINT UQ_FeeRefund_organizationId_refundNo UNIQUE (organizationId, refundNo),
      CONSTRAINT FK_FeeRefund_organizationId FOREIGN KEY (organizationId) REFERENCES dbo.Organization(id),
      CONSTRAINT FK_FeeRefund_branchId FOREIGN KEY (branchId) REFERENCES dbo.Branch(id),
      CONSTRAINT FK_FeeRefund_paymentId FOREIGN KEY (paymentId) REFERENCES dbo.FeePayment(id),
      CONSTRAINT FK_FeeRefund_refundedById FOREIGN KEY (refundedById) REFERENCES dbo.[User](id),
      CONSTRAINT CK_FeeRefund_method CHECK (method IN (N'BANK_TRANSFER', N'UPI', N'CHEQUE', N'CASH')),
      CONSTRAINT CK_FeeRefund_amount CHECK (amount > 0)
    );
    CREATE NONCLUSTERED INDEX IX_FeeRefund_org_branch_refundedAt ON dbo.FeeRefund(organizationId, branchId, refundedAt);
    CREATE UNIQUE NONCLUSTERED INDEX UX_FeeRefund_paymentId ON dbo.FeeRefund(paymentId);
  END;

  IF OBJECT_ID(N'dbo.BankAccount', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.BankAccount (
      id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_BankAccount PRIMARY KEY,
      organizationId UNIQUEIDENTIFIER NOT NULL,
      branchId UNIQUEIDENTIFIER NOT NULL,
      ledgerAccountId UNIQUEIDENTIFIER NOT NULL,
      name NVARCHAR(100) NOT NULL,
      bankName NVARCHAR(100) NOT NULL,
      accountLast4 NVARCHAR(4) NOT NULL,
      accountType NVARCHAR(30) NOT NULL,
      openingBalance DECIMAL(12,2) NOT NULL CONSTRAINT DF_BankAccount_openingBalance DEFAULT 0,
      isActive BIT NOT NULL CONSTRAINT DF_BankAccount_isActive DEFAULT 1,
      createdAt DATETIME2 NOT NULL CONSTRAINT DF_BankAccount_createdAt DEFAULT SYSUTCDATETIME(),
      CONSTRAINT UQ_BankAccount_branchId_name UNIQUE (branchId, name),
      CONSTRAINT FK_BankAccount_organizationId FOREIGN KEY (organizationId) REFERENCES dbo.Organization(id),
      CONSTRAINT FK_BankAccount_branchId FOREIGN KEY (branchId) REFERENCES dbo.Branch(id),
      CONSTRAINT FK_BankAccount_ledgerAccountId FOREIGN KEY (ledgerAccountId) REFERENCES dbo.LedgerAccount(id),
      CONSTRAINT CK_BankAccount_type CHECK (accountType IN (N'OPERATING', N'HOSTEL', N'TRUST', N'GRANT', N'OTHER')),
      CONSTRAINT CK_BankAccount_openingBalance CHECK (openingBalance >= 0)
    );
    CREATE NONCLUSTERED INDEX IX_BankAccount_org_branch_active ON dbo.BankAccount(organizationId, branchId, isActive);
  END;

  IF OBJECT_ID(N'dbo.BankStatementLine', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.BankStatementLine (
      id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_BankStatementLine PRIMARY KEY,
      organizationId UNIQUEIDENTIFIER NOT NULL,
      branchId UNIQUEIDENTIFIER NOT NULL,
      bankAccountId UNIQUEIDENTIFIER NOT NULL,
      transactionDate DATE NOT NULL,
      description NVARCHAR(300) NOT NULL,
      reference NVARCHAR(100) NULL,
      direction NVARCHAR(6) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      fingerprint NVARCHAR(64) NOT NULL,
      status NVARCHAR(12) NOT NULL CONSTRAINT DF_BankStatementLine_status DEFAULT N'UNMATCHED',
      matchedJournalLineId UNIQUEIDENTIFIER NULL,
      importedById UNIQUEIDENTIFIER NOT NULL,
      createdAt DATETIME2 NOT NULL CONSTRAINT DF_BankStatementLine_createdAt DEFAULT SYSUTCDATETIME(),
      CONSTRAINT UQ_BankStatementLine_account_fingerprint UNIQUE (bankAccountId, fingerprint),
      CONSTRAINT FK_BankStatementLine_organizationId FOREIGN KEY (organizationId) REFERENCES dbo.Organization(id),
      CONSTRAINT FK_BankStatementLine_branchId FOREIGN KEY (branchId) REFERENCES dbo.Branch(id),
      CONSTRAINT FK_BankStatementLine_bankAccountId FOREIGN KEY (bankAccountId) REFERENCES dbo.BankAccount(id),
      CONSTRAINT FK_BankStatementLine_matchedJournalLineId FOREIGN KEY (matchedJournalLineId) REFERENCES dbo.JournalLine(id),
      CONSTRAINT FK_BankStatementLine_importedById FOREIGN KEY (importedById) REFERENCES dbo.[User](id),
      CONSTRAINT CK_BankStatementLine_direction CHECK (direction IN (N'CREDIT', N'DEBIT')),
      CONSTRAINT CK_BankStatementLine_status CHECK (status IN (N'UNMATCHED', N'MATCHED', N'IGNORED')),
      CONSTRAINT CK_BankStatementLine_amount CHECK (amount > 0)
    );
    CREATE UNIQUE NONCLUSTERED INDEX UX_BankStatementLine_matchedJournalLineId ON dbo.BankStatementLine(matchedJournalLineId) WHERE matchedJournalLineId IS NOT NULL;
    CREATE NONCLUSTERED INDEX IX_BankStatementLine_org_branch_date_status ON dbo.BankStatementLine(organizationId, branchId, transactionDate, status);
  END;

  IF OBJECT_ID(N'dbo.DepartmentBudget', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.DepartmentBudget (
      id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_DepartmentBudget PRIMARY KEY,
      organizationId UNIQUEIDENTIFIER NOT NULL,
      branchId UNIQUEIDENTIFIER NOT NULL,
      fiscalYear NVARCHAR(7) NOT NULL,
      department NVARCHAR(100) NOT NULL,
      category NVARCHAR(60) NOT NULL,
      allocated DECIMAL(12,2) NOT NULL,
      hardStop BIT NOT NULL CONSTRAINT DF_DepartmentBudget_hardStop DEFAULT 0,
      isActive BIT NOT NULL CONSTRAINT DF_DepartmentBudget_isActive DEFAULT 1,
      createdById UNIQUEIDENTIFIER NOT NULL,
      createdAt DATETIME2 NOT NULL CONSTRAINT DF_DepartmentBudget_createdAt DEFAULT SYSUTCDATETIME(),
      CONSTRAINT UQ_DepartmentBudget_scope UNIQUE (branchId, fiscalYear, department, category),
      CONSTRAINT FK_DepartmentBudget_organizationId FOREIGN KEY (organizationId) REFERENCES dbo.Organization(id),
      CONSTRAINT FK_DepartmentBudget_branchId FOREIGN KEY (branchId) REFERENCES dbo.Branch(id),
      CONSTRAINT FK_DepartmentBudget_createdById FOREIGN KEY (createdById) REFERENCES dbo.[User](id),
      CONSTRAINT CK_DepartmentBudget_allocated CHECK (allocated >= 0)
    );
    CREATE NONCLUSTERED INDEX IX_DepartmentBudget_org_branch_year_active ON dbo.DepartmentBudget(organizationId, branchId, fiscalYear, isActive);
  END;

  IF OBJECT_ID(N'dbo.GrantFund', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.GrantFund (
      id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_GrantFund PRIMARY KEY,
      organizationId UNIQUEIDENTIFIER NOT NULL,
      branchId UNIQUEIDENTIFIER NOT NULL,
      code NVARCHAR(40) NOT NULL,
      name NVARCHAR(200) NOT NULL,
      donor NVARCHAR(200) NOT NULL,
      restriction NVARCHAR(500) NOT NULL,
      awarded DECIMAL(12,2) NOT NULL,
      received DECIMAL(12,2) NOT NULL CONSTRAINT DF_GrantFund_received DEFAULT 0,
      startDate DATE NOT NULL,
      endDate DATE NOT NULL,
      status NVARCHAR(15) NOT NULL CONSTRAINT DF_GrantFund_status DEFAULT N'ACTIVE',
      createdById UNIQUEIDENTIFIER NOT NULL,
      createdAt DATETIME2 NOT NULL CONSTRAINT DF_GrantFund_createdAt DEFAULT SYSUTCDATETIME(),
      CONSTRAINT UQ_GrantFund_branchId_code UNIQUE (branchId, code),
      CONSTRAINT FK_GrantFund_organizationId FOREIGN KEY (organizationId) REFERENCES dbo.Organization(id),
      CONSTRAINT FK_GrantFund_branchId FOREIGN KEY (branchId) REFERENCES dbo.Branch(id),
      CONSTRAINT FK_GrantFund_createdById FOREIGN KEY (createdById) REFERENCES dbo.[User](id),
      CONSTRAINT CK_GrantFund_amounts CHECK (awarded > 0 AND received >= 0 AND received <= awarded),
      CONSTRAINT CK_GrantFund_dates CHECK (endDate >= startDate),
      CONSTRAINT CK_GrantFund_status CHECK (status IN (N'ACTIVE', N'COMPLETED', N'CLOSED'))
    );
    CREATE NONCLUSTERED INDEX IX_GrantFund_org_branch_status ON dbo.GrantFund(organizationId, branchId, status);
  END;

  IF OBJECT_ID(N'dbo.GrantTransaction', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.GrantTransaction (
      id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_GrantTransaction PRIMARY KEY,
      organizationId UNIQUEIDENTIFIER NOT NULL,
      branchId UNIQUEIDENTIFIER NOT NULL,
      grantFundId UNIQUEIDENTIFIER NOT NULL,
      transactionDate DATE NOT NULL,
      kind NVARCHAR(10) NOT NULL,
      description NVARCHAR(300) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      sourceType NVARCHAR(30) NULL,
      sourceId NVARCHAR(60) NULL,
      createdById UNIQUEIDENTIFIER NOT NULL,
      createdAt DATETIME2 NOT NULL CONSTRAINT DF_GrantTransaction_createdAt DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_GrantTransaction_organizationId FOREIGN KEY (organizationId) REFERENCES dbo.Organization(id),
      CONSTRAINT FK_GrantTransaction_branchId FOREIGN KEY (branchId) REFERENCES dbo.Branch(id),
      CONSTRAINT FK_GrantTransaction_grantFundId FOREIGN KEY (grantFundId) REFERENCES dbo.GrantFund(id),
      CONSTRAINT FK_GrantTransaction_createdById FOREIGN KEY (createdById) REFERENCES dbo.[User](id),
      CONSTRAINT CK_GrantTransaction_kind CHECK (kind IN (N'RECEIPT', N'EXPENSE')),
      CONSTRAINT CK_GrantTransaction_amount CHECK (amount > 0)
    );
    CREATE NONCLUSTERED INDEX IX_GrantTransaction_org_branch_fund_date ON dbo.GrantTransaction(organizationId, branchId, grantFundId, transactionDate);
  END;

  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Expense_grantFundId')
    ALTER TABLE dbo.Expense ADD CONSTRAINT FK_Expense_grantFundId FOREIGN KEY (grantFundId) REFERENCES dbo.GrantFund(id);

  COMMIT TRAN;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  THROW;
END CATCH;
GO

ALTER SECURITY POLICY security.TenantIsolation
  ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[FeeRefund],
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[FeeRefund] AFTER INSERT,
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[FeeRefund] AFTER UPDATE,
  ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[BankAccount],
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[BankAccount] AFTER INSERT,
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[BankAccount] AFTER UPDATE,
  ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[BankStatementLine],
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[BankStatementLine] AFTER INSERT,
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[BankStatementLine] AFTER UPDATE,
  ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[DepartmentBudget],
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[DepartmentBudget] AFTER INSERT,
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[DepartmentBudget] AFTER UPDATE,
  ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[GrantFund],
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[GrantFund] AFTER INSERT,
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[GrantFund] AFTER UPDATE,
  ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[GrantTransaction],
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[GrantTransaction] AFTER INSERT,
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[GrantTransaction] AFTER UPDATE;
GO
