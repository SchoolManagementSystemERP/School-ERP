SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRAN;

  IF NOT EXISTS (SELECT 1 FROM dbo.Permission WHERE code = N'audit.read')
    INSERT INTO dbo.Permission (code, module, description)
      VALUES (N'audit.read', N'audit', N'View the immutable organization audit log');

  EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = 1;
  INSERT INTO dbo.RolePermission (organizationId, roleId, permissionCode)
  SELECT NULL, r.id, N'audit.read'
  FROM dbo.Role r
  WHERE r.organizationId IS NULL
    AND r.code IN (
      N'GROUP_OWNER', N'GROUP_ADMIN', N'FINANCE_HEAD', N'BRANCH_ADMIN', N'PRINCIPAL',
      N'ACCOUNTANT', N'HR', N'DIRECTOR', N'TRUST_SECRETARY', N'TREASURER',
      N'COMPLIANCE_OFFICER', N'INTERNAL_AUDITOR', N'REGIONAL_AUDITOR', N'IT_HEAD'
    )
    AND NOT EXISTS (
      SELECT 1 FROM dbo.RolePermission rp
      WHERE rp.roleId = r.id AND rp.permissionCode = N'audit.read'
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
