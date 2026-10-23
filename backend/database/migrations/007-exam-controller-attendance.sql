-- Migration 007: the exam controller reads attendance (admit-card eligibility depends on it).
SET QUOTED_IDENTIFIER ON;
EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = 1;
INSERT INTO dbo.RolePermission (organizationId, roleId, permissionCode)
SELECT NULL, r.id, N'attendance.read'
FROM dbo.Role r
WHERE r.code = N'EXAM_CONTROLLER' AND r.organizationId IS NULL
  AND NOT EXISTS (SELECT 1 FROM dbo.RolePermission rp WHERE rp.roleId = r.id AND rp.permissionCode = N'attendance.read');
PRINT CONCAT('role permissions added: ', @@ROWCOUNT);
EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = 0;
GO
