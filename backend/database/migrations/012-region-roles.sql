-- Migration 012: built-in roles of a region office (alongside Regional Manager and Cluster Head).
-- All are region-level: they see and act only in the schools of their region, and open the Group portal.
-- Idempotent.
SET QUOTED_IDENTIFIER ON;
EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = 1;

DECLARE @roles TABLE (code NVARCHAR(40), name NVARCHAR(100), perms NVARCHAR(MAX));
INSERT INTO @roles VALUES
  -- head of the region office
  (N'ASST_REGIONAL_DIRECTOR', N'Assistant Regional Director', N'reports.view,group.view,students.read,staff.read,attendance.read,marks.read,fees.read'),
  -- academics
  (N'REGIONAL_ACADEMIC_COORDINATOR', N'Regional Academic Coordinator', N'reports.view,group.view,students.read,attendance.read,marks.read'),
  (N'SUBJECT_COORDINATOR', N'Subject Coordinator (Region)', N'reports.view,group.view,marks.read,staff.read'),
  (N'REGIONAL_EXAM_COORDINATOR', N'Regional Exam Coordinator', N'reports.view,group.view,students.read,attendance.read,marks.read,exams.manage'),
  (N'REGIONAL_INSPECTOR', N'Regional Inspector / Academic Auditor', N'reports.view,group.view,students.read,staff.read,attendance.read,marks.read'),
  (N'REGIONAL_TRAINING_COORDINATOR', N'Regional Training Coordinator', N'reports.view,group.view,staff.read'),
  (N'REGIONAL_COUNSELLING_COORDINATOR', N'Special Education / Counselling Coordinator', N'reports.view,group.view,students.read,attendance.read,marks.read'),
  -- finance
  (N'REGIONAL_ACCOUNTS_OFFICER', N'Regional Accounts Officer', N'reports.view,group.view,fees.read'),
  (N'REGIONAL_AUDITOR', N'Regional Auditor', N'reports.view,group.view,fees.read,staff.read'),
  -- staff
  (N'REGIONAL_HR_OFFICER', N'Regional HR Officer', N'reports.view,group.view,staff.read,leave.approve'),
  -- other work
  (N'REGIONAL_ADMISSIONS_COORDINATOR', N'Regional Admissions Coordinator', N'reports.view,group.view,students.read,frontoffice.manage'),
  (N'REGIONAL_PURCHASE_OFFICER', N'Regional Purchase / Store Officer', N'reports.view,group.view,inventory.manage'),
  (N'REGIONAL_TRANSPORT_COORDINATOR', N'Regional Transport Coordinator', N'reports.view,group.view,students.read,transport.manage'),
  (N'REGIONAL_INFRASTRUCTURE_OFFICER', N'Regional Infrastructure / Maintenance Officer', N'reports.view,group.view,inventory.manage'),
  (N'REGIONAL_IT_COORDINATOR', N'Regional IT Coordinator', N'reports.view,group.view'),
  (N'REGIONAL_SPORTS_COORDINATOR', N'Sports & Co-curricular Coordinator', N'reports.view,group.view,students.read,announcements.send'),
  (N'REGIONAL_PR_OFFICER', N'Regional PR / Marketing', N'reports.view,group.view,frontoffice.manage,announcements.send'),
  (N'REGIONAL_OFFICE_STAFF', N'Regional Office Staff', N'reports.view,group.view');

INSERT INTO dbo.Role (id, organizationId, code, name, level, isSystem)
SELECT NEWID(), NULL, x.code, x.name, N'REGION', 1
FROM @roles x
WHERE NOT EXISTS (SELECT 1 FROM dbo.Role r WHERE r.code = x.code AND r.organizationId IS NULL);
PRINT CONCAT('roles added: ', @@ROWCOUNT);

INSERT INTO dbo.RolePermission (organizationId, roleId, permissionCode)
SELECT NULL, r.id, LTRIM(RTRIM(p.value))
FROM @roles x
JOIN dbo.Role r ON r.code = x.code AND r.organizationId IS NULL
CROSS APPLY STRING_SPLIT(x.perms, ',') p
WHERE NOT EXISTS (SELECT 1 FROM dbo.RolePermission rp WHERE rp.roleId = r.id AND rp.permissionCode = LTRIM(RTRIM(p.value)));
PRINT CONCAT('role permissions added: ', @@ROWCOUNT);

EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = 0;
GO
