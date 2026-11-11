-- Ensure existing installations grant ledger management to the built-in finance roles.
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRAN;

  IF NOT EXISTS (SELECT 1 FROM dbo.Permission WHERE code = N'accounting.read')
    INSERT INTO dbo.Permission (code, module, description)
      VALUES (N'accounting.read', N'accounts', N'View chart of accounts, journals and financial statements');
  IF NOT EXISTS (SELECT 1 FROM dbo.Permission WHERE code = N'accounting.manage')
    INSERT INTO dbo.Permission (code, module, description)
      VALUES (N'accounting.manage', N'accounts', N'Manage chart of accounts and post journal vouchers');

  EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = 1;
  INSERT INTO dbo.RolePermission (organizationId, roleId, permissionCode)
  SELECT NULL, r.id, p.permissionCode
  FROM (VALUES
    (N'ACCOUNTANT', N'accounting.read'),
    (N'ACCOUNTANT', N'accounting.manage'),
    (N'FINANCE_HEAD', N'accounting.read'),
    (N'FINANCE_HEAD', N'accounting.manage')
  ) p(roleCode, permissionCode)
  JOIN dbo.Role r ON r.code = p.roleCode AND r.organizationId IS NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM dbo.RolePermission rp
    WHERE rp.roleId = r.id AND rp.permissionCode = p.permissionCode
  );
  EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = 0;

  COMMIT TRAN;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = 0;
  THROW;
END CATCH;
GO
