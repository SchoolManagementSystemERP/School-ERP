-- School ERP — starter data. Run after schema.sql and row-level-security.sql.
-- Adds: subscription plans, permissions, built-in roles with their permissions, subjects,
-- and a demo organization (DAV) with regions, three branches, academic years, classes and sections.
-- Safe to run once; it stops if the plans already exist.

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Platform context: row-level security lets platform admins write any organization's rows.
EXEC sp_set_session_context @key = N'is_platform_admin', @value = 1;

IF EXISTS (SELECT 1 FROM dbo.[Plan])
BEGIN
  PRINT 'Seed already applied — nothing to do.';
  RETURN;
END;

BEGIN TRAN;

-- ── Plans ────────────────────────────────────────────────────────────────────
INSERT INTO dbo.[Plan] (id, code, name, pricePerBranch, maxStudents, features, isActive) VALUES
  (NEWID(), 'basic', 'Basic', 2999.00, 500, '["students","attendance","marks","fees","communication"]', 1),
  (NEWID(), 'pro', 'Pro', 5999.00, 2000, '["students","attendance","marks","exams","fees","accounts","hr","library","inventory","transport","communication"]', 1),
  (NEWID(), 'enterprise', 'Enterprise', 9999.00, NULL, '["all","multi-branch","group-dashboard","custom-roles","api"]', 1);

-- ── Permissions ──────────────────────────────────────────────────────────────
INSERT INTO dbo.Permission (code, module, description) VALUES
  ('org.manage', 'organization', 'Manage organization settings, regions and branches'),
  ('users.manage', 'organization', 'Create users, assign roles, enable / disable accounts'),
  ('reports.view', 'organization', 'View dashboards and reports'),
  ('group.view', 'organization', 'View and compare all branches'),
  ('students.read', 'students', 'View students'),
  ('students.write', 'students', 'Admit and edit students'),
  ('students.transfer', 'students', 'Transfer students between branches'),
  ('staff.read', 'staff', 'View staff'),
  ('staff.write', 'staff', 'Add and edit staff'),
  ('classes.manage', 'academics', 'Manage grades, sections, subjects and timetable'),
  ('attendance.read', 'academics', 'View attendance'),
  ('attendance.write', 'academics', 'Mark attendance'),
  ('marks.read', 'academics', 'View marks'),
  ('marks.write', 'academics', 'Enter marks'),
  ('exams.manage', 'academics', 'Schedule exams and admit cards'),
  ('exams.publish', 'academics', 'Publish results'),
  ('coursework.write', 'academics', 'Create assignments and upload notes'),
  ('fees.read', 'fees', 'View fee accounts'),
  ('fees.collect', 'fees', 'Collect fees and issue receipts'),
  ('fees.structure', 'fees', 'Set fee plans and concessions'),
  ('expenses.write', 'accounts', 'Record expenses'),
  ('payroll.run', 'accounts', 'Process and pay salaries'),
  ('leave.apply', 'hr', 'Apply for leave'),
  ('leave.approve', 'hr', 'Approve or reject leave'),
  ('announcements.send', 'communication', 'Send announcements'),
  ('messages.send', 'communication', 'Send messages'),
  ('library.manage', 'facilities', 'Manage books, issue and return'),
  ('inventory.manage', 'facilities', 'Manage inventory and stock'),
  ('transport.manage', 'facilities', 'Manage routes, vehicles and allocations'),
  ('hostel.manage', 'facilities', 'Manage rooms, residents and outpasses'),
  ('frontoffice.manage', 'facilities', 'Manage enquiries and visitors'),
  ('self.view', 'self', 'View own (or own child''s) records'),
  ('procurement.request', 'procurement', 'Raise requisitions for items'),
  ('procurement.store', 'procurement', 'Store check, quotations, purchase orders and goods receipt'),
  ('procurement.approve', 'procurement', 'Approve purchases up to the principal''s limit'),
  ('procurement.approve_management', 'procurement', 'Approve purchases above the principal''s limit'),
  ('payables.manage', 'accounts', 'Vendor bills, vendor payments and petty cash');

-- ── Built-in roles (organizationId NULL = shared by every organization) ──────
DECLARE @roles TABLE (code NVARCHAR(40), name NVARCHAR(100), level NVARCHAR(10), perms NVARCHAR(MAX));
INSERT INTO @roles VALUES
  ('GROUP_OWNER', 'Group Owner / Chairman', 'ORG', 'reports.view,group.view,students.read,staff.read,attendance.read,marks.read,fees.read,procurement.approve_management'),
  ('GROUP_ADMIN', 'Group Admin', 'ORG', 'org.manage,users.manage,reports.view,group.view,students.read,staff.read,classes.manage'),
  ('ACADEMIC_HEAD', 'Academic Head', 'ORG', 'reports.view,group.view,students.read,attendance.read,marks.read,exams.manage,exams.publish,classes.manage'),
  ('FINANCE_HEAD', 'Finance Head', 'ORG', 'reports.view,group.view,fees.read,fees.structure,expenses.write,payroll.run,procurement.approve_management'),
  ('HR_HEAD', 'HR Head', 'ORG', 'reports.view,group.view,staff.read,staff.write,leave.approve,payroll.run'),
  ('REGIONAL_MANAGER', 'Regional Manager', 'REGION', 'reports.view,group.view,students.read,staff.read,attendance.read,marks.read,fees.read'),
  ('BRANCH_ADMIN', 'Branch Admin', 'BRANCH', 'users.manage,classes.manage,reports.view'),
  ('PRINCIPAL', 'Principal', 'BRANCH', 'reports.view,students.read,students.write,students.transfer,staff.read,staff.write,classes.manage,attendance.read,attendance.write,marks.read,marks.write,exams.publish,fees.read,fees.collect,fees.structure,leave.approve,announcements.send,messages.send,procurement.request,procurement.approve'),
  ('VICE_PRINCIPAL', 'Vice Principal', 'BRANCH', 'reports.view,students.read,students.write,staff.read,attendance.read,attendance.write,marks.read,marks.write,announcements.send,messages.send,procurement.request'),
  ('TEACHER', 'Teacher', 'BRANCH', 'students.read,attendance.read,attendance.write,marks.read,marks.write,coursework.write,leave.apply,announcements.send,messages.send,procurement.request'),
  ('ACCOUNTANT', 'Accountant', 'BRANCH', 'students.read,fees.read,fees.collect,fees.structure,expenses.write,payroll.run,reports.view,procurement.request,payables.manage'),
  ('RECEPTIONIST', 'Receptionist', 'BRANCH', 'students.read,students.write,frontoffice.manage,procurement.request'),
  ('EXAM_CONTROLLER', 'Exam Controller', 'BRANCH', 'students.read,attendance.read,marks.read,exams.manage,exams.publish,procurement.request'),
  ('HR', 'HR Manager', 'BRANCH', 'staff.read,staff.write,leave.approve,payroll.run,procurement.request'),
  ('TRANSPORT_MANAGER', 'Transport Manager', 'BRANCH', 'students.read,transport.manage,procurement.request'),
  ('HOSTEL_WARDEN', 'Hostel Warden', 'BRANCH', 'students.read,hostel.manage,procurement.request'),
  ('LIBRARIAN', 'Librarian', 'BRANCH', 'students.read,library.manage,procurement.request'),
  ('INVENTORY_MANAGER', 'Inventory Manager', 'BRANCH', 'inventory.manage,procurement.request,procurement.store'),
  ('STUDENT', 'Student', 'SELF', 'self.view,messages.send'),
  ('PARENT', 'Parent', 'SELF', 'self.view,messages.send'),
  -- head office of a school group (migration 011)
  ('DIRECTOR', 'CEO / Director (Schools)', 'ORG', 'reports.view,group.view,students.read,staff.read,attendance.read,marks.read,fees.read,leave.approve,announcements.send,messages.send,procurement.approve_management'),
  ('TRUST_SECRETARY', 'Secretary / Manager', 'ORG', 'reports.view,group.view,students.read,staff.read,attendance.read,marks.read,fees.read,announcements.send,procurement.approve_management'),
  ('TREASURER', 'Treasurer', 'ORG', 'reports.view,group.view,fees.read,procurement.approve_management'),
  ('TRUSTEE', 'Trustee / Board Member', 'ORG', 'reports.view,group.view'),
  ('ADMISSIONS_HEAD', 'Admissions Head', 'ORG', 'reports.view,group.view,students.read,students.write,frontoffice.manage'),
  ('PURCHASE_HEAD', 'Purchase Head', 'ORG', 'reports.view,group.view,inventory.manage,procurement.store'),
  ('IT_HEAD', 'IT Head', 'ORG', 'reports.view,group.view,users.manage'),
  ('COMPLIANCE_OFFICER', 'Compliance / Legal Officer', 'ORG', 'reports.view,group.view,students.read,staff.read'),
  ('INTERNAL_AUDITOR', 'Internal Auditor', 'ORG', 'reports.view,group.view,fees.read,staff.read'),
  ('INSPECTION_OFFICER', 'Quality / Inspection Officer', 'ORG', 'reports.view,group.view,students.read,staff.read,attendance.read,marks.read'),
  ('TRANSPORT_HEAD', 'Transport Head', 'ORG', 'reports.view,group.view,students.read,transport.manage'),
  ('MARKETING_HEAD', 'Marketing / PR Head', 'ORG', 'reports.view,group.view,frontoffice.manage,announcements.send'),
  ('TRAINING_COORDINATOR', 'Training Coordinator', 'ORG', 'reports.view,group.view,staff.read'),
  ('CLUSTER_HEAD', 'Cluster / Area Coordinator', 'REGION', 'reports.view,group.view,students.read,staff.read,attendance.read,marks.read,fees.read'),
  -- region office (migration 012)
  ('ASST_REGIONAL_DIRECTOR', 'Assistant Regional Director', 'REGION', 'reports.view,group.view,students.read,staff.read,attendance.read,marks.read,fees.read'),
  ('REGIONAL_ACADEMIC_COORDINATOR', 'Regional Academic Coordinator', 'REGION', 'reports.view,group.view,students.read,attendance.read,marks.read'),
  ('SUBJECT_COORDINATOR', 'Subject Coordinator (Region)', 'REGION', 'reports.view,group.view,marks.read,staff.read'),
  ('REGIONAL_EXAM_COORDINATOR', 'Regional Exam Coordinator', 'REGION', 'reports.view,group.view,students.read,attendance.read,marks.read,exams.manage'),
  ('REGIONAL_INSPECTOR', 'Regional Inspector / Academic Auditor', 'REGION', 'reports.view,group.view,students.read,staff.read,attendance.read,marks.read'),
  ('REGIONAL_TRAINING_COORDINATOR', 'Regional Training Coordinator', 'REGION', 'reports.view,group.view,staff.read'),
  ('REGIONAL_COUNSELLING_COORDINATOR', 'Special Education / Counselling Coordinator', 'REGION', 'reports.view,group.view,students.read,attendance.read,marks.read'),
  ('REGIONAL_ACCOUNTS_OFFICER', 'Regional Accounts Officer', 'REGION', 'reports.view,group.view,fees.read'),
  ('REGIONAL_AUDITOR', 'Regional Auditor', 'REGION', 'reports.view,group.view,fees.read,staff.read'),
  ('REGIONAL_HR_OFFICER', 'Regional HR Officer', 'REGION', 'reports.view,group.view,staff.read,leave.approve'),
  ('REGIONAL_ADMISSIONS_COORDINATOR', 'Regional Admissions Coordinator', 'REGION', 'reports.view,group.view,students.read,frontoffice.manage'),
  ('REGIONAL_PURCHASE_OFFICER', 'Regional Purchase / Store Officer', 'REGION', 'reports.view,group.view,inventory.manage'),
  ('REGIONAL_TRANSPORT_COORDINATOR', 'Regional Transport Coordinator', 'REGION', 'reports.view,group.view,students.read,transport.manage'),
  ('REGIONAL_INFRASTRUCTURE_OFFICER', 'Regional Infrastructure / Maintenance Officer', 'REGION', 'reports.view,group.view,inventory.manage'),
  ('REGIONAL_IT_COORDINATOR', 'Regional IT Coordinator', 'REGION', 'reports.view,group.view'),
  ('REGIONAL_SPORTS_COORDINATOR', 'Sports & Co-curricular Coordinator', 'REGION', 'reports.view,group.view,students.read,announcements.send'),
  ('REGIONAL_PR_OFFICER', 'Regional PR / Marketing', 'REGION', 'reports.view,group.view,frontoffice.manage,announcements.send'),
  ('REGIONAL_OFFICE_STAFF', 'Regional Office Staff', 'REGION', 'reports.view,group.view');

INSERT INTO dbo.Role (id, organizationId, code, name, level, isSystem)
SELECT NEWID(), NULL, code, name, level, 1 FROM @roles;

INSERT INTO dbo.RolePermission (organizationId, roleId, permissionCode)
SELECT NULL, r.id, LTRIM(RTRIM(p.value))
FROM @roles x
JOIN dbo.Role r ON r.code = x.code AND r.organizationId IS NULL
CROSS APPLY STRING_SPLIT(x.perms, ',') p;

-- ── Demo organization: DAV ───────────────────────────────────────────────────
DECLARE @pro UNIQUEIDENTIFIER = (SELECT id FROM dbo.[Plan] WHERE code = 'enterprise');
DECLARE @org UNIQUEIDENTIFIER = NEWID();

INSERT INTO dbo.Organization (id, name, subdomain, contactEmail, contactPhone, planId, status, trialEndsAt, settings)
VALUES (@org, 'DAV College Managing Committee', 'dav', 'erp@dav.example.in', '+91 11 0000 0000', @pro, 'TRIAL',
        DATEADD(DAY, 30, SYSUTCDATETIME()),
        '{"gradingScale":"CBSE","lateFeePerDay":100,"branchCanOverrideFees":true}');

DECLARE @east UNIQUEIDENTIFIER = NEWID(), @north UNIQUEIDENTIFIER = NEWID();
INSERT INTO dbo.Region (id, organizationId, name) VALUES (@east, @org, 'East (Jharkhand & West Bengal)'), (@north, @org, 'North (Delhi NCR)');

DECLARE @branches TABLE (id UNIQUEIDENTIFIER, code NVARCHAR(20));
INSERT INTO dbo.Branch (id, organizationId, regionId, code, name, board, address, city, state, isActive)
OUTPUT inserted.id, inserted.code INTO @branches
VALUES
  (NEWID(), @org, @east, 'DAV-RNC', 'DAV Public School, Ranchi', 'CBSE', 'Bariatu Road', 'Ranchi', 'Jharkhand', 1),
  (NEWID(), @org, @east, 'DAV-HLD', 'DAV Public School, Haldia', 'CBSE', 'Durgachak', 'Haldia', 'West Bengal', 1),
  (NEWID(), @org, @north, 'DAV-PTP', 'DAV Public School, Pitampura', 'CBSE', 'Pitampura', 'New Delhi', 'Delhi', 1);

INSERT INTO dbo.AcademicYear (id, organizationId, name, startDate, endDate, isCurrent) VALUES
  (NEWID(), @org, '2025-26', '2025-04-01', '2026-03-31', 0),
  (NEWID(), @org, '2026-27', '2026-04-01', '2027-03-31', 1);

INSERT INTO dbo.Subject (id, organizationId, code, name) VALUES
  (NEWID(), @org, 'ENG', 'English'), (NEWID(), @org, 'HIN', 'Hindi'), (NEWID(), @org, 'MATH', 'Mathematics'),
  (NEWID(), @org, 'PHY', 'Physics'), (NEWID(), @org, 'CHEM', 'Chemistry'), (NEWID(), @org, 'BIO', 'Biology'),
  (NEWID(), @org, 'SCI', 'Science'), (NEWID(), @org, 'SST', 'Social Science'), (NEWID(), @org, 'CS', 'Computer Science'),
  (NEWID(), @org, 'ECO', 'Economics'), (NEWID(), @org, 'ACC', 'Accountancy');

-- Classes 8–12 with sections A and B in every branch
INSERT INTO dbo.Grade (id, organizationId, branchId, name, sortOrder, medium)
SELECT NEWID(), @org, b.id, CONCAT('Class ', g.n), g.n, 'English'
FROM @branches b CROSS JOIN (VALUES (8), (9), (10), (11), (12)) g(n);

INSERT INTO dbo.Section (id, organizationId, branchId, gradeId, name, capacity)
SELECT NEWID(), @org, gr.branchId, gr.id, s.name, 40
FROM dbo.Grade gr CROSS JOIN (VALUES ('A'), ('B')) s(name)
WHERE gr.organizationId = @org;

-- Annual tuition per grade for the current year, three installments (40 / 30 / 30 %)
DECLARE @year UNIQUEIDENTIFIER = (SELECT id FROM dbo.AcademicYear WHERE organizationId = @org AND isCurrent = 1);
INSERT INTO dbo.FeePlan (id, organizationId, branchId, academicYearId, gradeId, feeHead, annualAmount)
SELECT NEWID(), @org, gr.branchId, @year, gr.id, 'TUITION',
       CASE gr.sortOrder WHEN 8 THEN 42000 WHEN 9 THEN 45000 WHEN 10 THEN 48000 WHEN 11 THEN 54000 ELSE 57000 END
FROM dbo.Grade gr WHERE gr.organizationId = @org;

INSERT INTO dbo.FeeInstallment (id, organizationId, feePlanId, installmentNo, name, dueDate, [percent])
SELECT NEWID(), @org, fp.id, i.n, i.name, i.due, i.pct
FROM dbo.FeePlan fp
CROSS JOIN (VALUES (1, 'First Installment', CAST('2026-04-15' AS DATE), 40.00),
                   (2, 'Second Installment', CAST('2026-09-15' AS DATE), 30.00),
                   (3, 'Third Installment', CAST('2026-12-15' AS DATE), 30.00)) i(n, name, due, pct)
WHERE fp.organizationId = @org;

-- Default report-card grading (CBSE 9-point)
INSERT INTO dbo.GradingScale (id, organizationId, name, bands, isDefault)
VALUES (NEWID(), @org, N'CBSE 9-point', N'[{"min":91,"max":100,"grade":"A1","point":10},{"min":81,"max":90,"grade":"A2","point":9},{"min":71,"max":80,"grade":"B1","point":8},{"min":61,"max":70,"grade":"B2","point":7},{"min":51,"max":60,"grade":"C1","point":6},{"min":41,"max":50,"grade":"C2","point":5},{"min":33,"max":40,"grade":"D","point":4},{"min":0,"max":32,"grade":"E","point":0,"remark":"Needs improvement"}]', 1);

COMMIT;

PRINT 'Seed complete.';
