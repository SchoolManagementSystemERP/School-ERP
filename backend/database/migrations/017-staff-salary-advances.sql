SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRAN;

  IF OBJECT_ID(N'dbo.StaffAdvance', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.StaffAdvance (
      id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_StaffAdvance PRIMARY KEY,
      organizationId UNIQUEIDENTIFIER NOT NULL,
      branchId UNIQUEIDENTIFIER NOT NULL,
      staffId UNIQUEIDENTIFIER NOT NULL,
      principalAmount DECIMAL(12,2) NOT NULL,
      outstandingAmount DECIMAL(12,2) NOT NULL,
      installmentAmount DECIMAL(12,2) NOT NULL,
      startMonth NVARCHAR(7) NOT NULL,
      purpose NVARCHAR(300) NOT NULL,
      disbursedMethod NVARCHAR(20) NOT NULL,
      reference NVARCHAR(100) NULL,
      disbursedAt DATETIME2 NOT NULL,
      status NVARCHAR(12) NOT NULL CONSTRAINT DF_StaffAdvance_status DEFAULT N'ACTIVE',
      createdById UNIQUEIDENTIFIER NOT NULL,
      createdAt DATETIME2 NOT NULL CONSTRAINT DF_StaffAdvance_createdAt DEFAULT SYSUTCDATETIME(),
      CONSTRAINT CK_StaffAdvance_amounts CHECK (
        principalAmount > 0 AND outstandingAmount >= 0 AND outstandingAmount <= principalAmount
        AND installmentAmount > 0 AND installmentAmount <= principalAmount
      ),
      CONSTRAINT CK_StaffAdvance_method CHECK (disbursedMethod IN (N'BANK_TRANSFER', N'CASH')),
      CONSTRAINT CK_StaffAdvance_status CHECK (status IN (N'ACTIVE', N'PAID', N'CANCELLED')),
      CONSTRAINT CK_StaffAdvance_startMonth CHECK (
        startMonth LIKE N'[0-9][0-9][0-9][0-9]-[0-1][0-9]'
        AND TRY_CONVERT(date, startMonth + N'-01', 23) IS NOT NULL
      ),
      CONSTRAINT FK_StaffAdvance_staffId FOREIGN KEY (staffId) REFERENCES dbo.Staff(id)
    );
    CREATE NONCLUSTERED INDEX IX_StaffAdvance_org_branch_status_month
      ON dbo.StaffAdvance(organizationId, branchId, status, startMonth);
    CREATE NONCLUSTERED INDEX IX_StaffAdvance_staff_status
      ON dbo.StaffAdvance(staffId, status);
  END;

  COMMIT TRAN;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  THROW;
END CATCH;
GO

ALTER SECURITY POLICY security.TenantIsolation
  ADD FILTER PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[StaffAdvance],
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[StaffAdvance] AFTER INSERT,
  ADD BLOCK PREDICATE security.fn_tenant_access([organizationId]) ON dbo.[StaffAdvance] AFTER UPDATE;
GO
