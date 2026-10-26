-- Migration 011: built-in roles of a school group's head office (trust / management) and of a cluster.
-- They sign in to the Group portal (dashboard comparing the schools in their scope). Idempotent.
SET QUOTED_IDENTIFIER ON;
EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = 1;

DECLARE @roles TABLE (code NVARCHAR(40), name NVARCHAR(100), level NVARCHAR(10), perms NVARCHAR(MAX));
INSERT INTO @roles VALUES
  (N'DIRECTOR', N'CEO / Director (Schools)', N'ORG', N'reports.view,group.view,students.read,staff.read,attendance.read,marks.read,fees.read,leave.approve,announcements.send,messages.send,procurement.approve_management'),
  (N'TRUST_SECRETARY', N'Secretary / Manager', N'ORG', N'reports.view,group.view,students.read,staff.read,attendance.read,marks.read,fees.read,announcements.send,procurement.approve_management'),
  (N'TREASURER', N'Treasurer', N'ORG', N'reports.view,group.view,fees.read,procurement.approve_management'),
  (N'TRUSTEE', N'Trustee / Board Member', N'ORG', N'reports.view,group.view'),
  (N'ADMISSIONS_HEAD', N'Admissions Head', N'ORG', N'reports.view,group.view,students.read,students.write,frontoffice.manage'),
  (N'PURCHASE_HEAD', N'Purchase Head', N'ORG', N'reports.view,group.view,inventory.manage,procurement.store'),
  (N'IT_HEAD', N'IT Head', N'ORG', N'reports.view,group.view,users.manage'),
  (N'COMPLIANCE_OFFICER', N'Compliance / Legal Officer', N'ORG', N'reports.view,group.view,students.read,staff.read'),
  (N'INTERNAL_AUDITOR', N'Internal Auditor', N'ORG', N'reports.view,group.view,fees.read,staff.read'),
  (N'INSPECTION_OFFICER', N'Quality / Inspection Officer', N'ORG', N'reports.view,group.view,students.read,staff.read,attendance.read,marks.read'),
  (N'TRANSPORT_HEAD', N'Transport Head', N'ORG', N'reports.view,group.view,students.read,transport.manage'),
  (N'MARKETING_HEAD', N'Marketing / PR Head', N'ORG', N'reports.view,group.view,frontoffice.manage,announcements.send'),
  (N'TRAINING_COORDINATOR', N'Training Coordinator', N'ORG', N'reports.view,group.view,staff.read'),
  (N'CLUSTER_HEAD', N'Cluster / Area Coordinator', N'REGION', N'reports.view,group.view,students.read,staff.read,attendance.read,marks.read,fees.read');

INSERT INTO dbo.Role (id, organizationId, code, name, level, isSystem)
SELECT NEWID(), NULL, x.code, x.name, x.level, 1
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
