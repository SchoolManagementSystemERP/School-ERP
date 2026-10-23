-- School ERP — stored procedures. Idempotent (CREATE OR ALTER); run by setup.ps1 and migrate.ps1.
--   sqlcmd -S localhost -E -C -I -d school_erp -i database/procedures.sql
SET QUOTED_IDENTIFIER ON;
GO

-- ── Maintenance ──────────────────────────────────────────────────────────────
-- Removes sign-in material nobody can use any more and refreshes optimizer statistics.
-- Scheduled weekly by maintenance/install-backup-tasks.ps1. Runs as an administrator, so it
-- sets the platform context itself (tenant tables are protected by row-level security).
CREATE OR ALTER PROCEDURE dbo.usp_Maintenance
  @KeepDays INT = 30
AS
BEGIN
  SET NOCOUNT ON;
  EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = 1;
  DECLARE @cutoff DATETIME2 = DATEADD(DAY, -@KeepDays, SYSUTCDATETIME());

  DELETE FROM dbo.RefreshToken WHERE expiresAt < @cutoff OR revokedAt < @cutoff;
  DECLARE @tokens INT = @@ROWCOUNT;
  DELETE FROM dbo.PasswordResetToken WHERE expiresAt < @cutoff;
  DECLARE @resets INT = @@ROWCOUNT;
  DELETE FROM dbo.OtpCode WHERE expiresAt < @cutoff;
  DECLARE @otps INT = @@ROWCOUNT;
  DELETE FROM dbo.PaymentWebhookEvent WHERE processedAt < DATEADD(DAY, -180, SYSUTCDATETIME()) AND error IS NULL;
  DECLARE @webhooks INT = @@ROWCOUNT;

  EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = 0;
  EXEC sys.sp_updatestats;
  SELECT @tokens AS refreshTokensRemoved, @resets AS resetTokensRemoved, @otps AS otpCodesRemoved, @webhooks AS webhooksRemoved;
END;
GO

-- ── Data protection (DPDP Act, 2023) ─────────────────────────────────────────
-- Everything stored about one student, as JSON — for a parent's data-access request.
-- Runs under the caller's row-level security context, so it only works for the caller's organization.
CREATE OR ALTER PROCEDURE dbo.usp_StudentDataExport
  @StudentId UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM dbo.Student WHERE id = @StudentId) THROW 50001, 'Student not found.', 1;
  SELECT (
    SELECT
      JSON_QUERY((SELECT s.id, s.admissionNo, s.firstName, s.middleName, s.lastName, s.gender, s.dob, s.bloodGroup, s.category, s.religion,
              s.aadhaarLast4, s.admissionDate, s.status, s.address, s.health, s.previousSchool, s.profile
         FROM dbo.Student s WHERE s.id = @StudentId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)) AS student,
      (SELECT g.name, g.phone, g.email, g.occupation, sg.relation FROM dbo.StudentGuardian sg JOIN dbo.Guardian g ON g.id = sg.guardianId
        WHERE sg.studentId = @StudentId FOR JSON PATH) AS guardians,
      (SELECT ay.name AS academicYear, gr.name AS class, sec.name AS section, e.rollNo, e.status FROM dbo.Enrollment e
         JOIN dbo.AcademicYear ay ON ay.id = e.academicYearId JOIN dbo.Section sec ON sec.id = e.sectionId JOIN dbo.Grade gr ON gr.id = sec.gradeId
        WHERE e.studentId = @StudentId FOR JSON PATH) AS enrollments,
      (SELECT ex.name AS exam, sub.name AS subject, m.marks, m.isAbsent FROM dbo.Mark m JOIN dbo.ExamPaper p ON p.id = m.examPaperId
         JOIN dbo.Exam ex ON ex.id = p.examId JOIN dbo.Subject sub ON sub.id = p.subjectId WHERE m.studentId = @StudentId FOR JSON PATH) AS marks,
      (SELECT a.date, a.periodNo, ae.status FROM dbo.AttendanceEntry ae JOIN dbo.AttendanceSession a ON a.id = ae.sessionId
        WHERE ae.studentId = @StudentId FOR JSON PATH) AS attendance,
      (SELECT fp.receiptNo, fp.amount, fp.lateFee, fp.method, fp.paidAt FROM dbo.FeePayment fp WHERE fp.studentId = @StudentId FOR JSON PATH) AS feePayments,
      (SELECT b.title, l.issueDate, l.dueDate, l.returnDate FROM dbo.BookLoan l JOIN dbo.Book b ON b.id = l.bookId WHERE l.studentId = @StudentId FOR JSON PATH) AS libraryLoans
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
  ) AS data;
END;
GO

-- Erases a former student's personal details on request, keeping the records the school must retain
-- (enrollment history, marks, fee receipts) under an anonymous name. Only for students who have left.
CREATE OR ALTER PROCEDURE dbo.usp_StudentAnonymize
  @StudentId UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  DECLARE @status NVARCHAR(15), @userId UNIQUEIDENTIFIER;
  SELECT @status = status, @userId = userId FROM dbo.Student WHERE id = @StudentId;
  IF @status IS NULL THROW 50001, 'Student not found.', 1;
  IF @status = N'ACTIVE' THROW 50002, 'Only students who have left can be anonymized. Change the status first.', 1;

  BEGIN TRAN;
  UPDATE dbo.Student
     SET firstName = N'Former student', middleName = NULL, lastName = NULL, dob = NULL, bloodGroup = NULL, religion = NULL,
         aadhaarLast4 = NULL, address = NULL, health = NULL, previousSchool = NULL, sensitive = NULL, profile = NULL, userId = NULL
   WHERE id = @StudentId;

  -- Guardians who belong to no other student lose their details too.
  DECLARE @guardians TABLE (id UNIQUEIDENTIFIER, userId UNIQUEIDENTIFIER);
  INSERT INTO @guardians SELECT g.id, g.userId FROM dbo.Guardian g JOIN dbo.StudentGuardian sg ON sg.guardianId = g.id
   WHERE sg.studentId = @StudentId AND NOT EXISTS (SELECT 1 FROM dbo.StudentGuardian o WHERE o.guardianId = g.id AND o.studentId <> @StudentId);
  DELETE FROM dbo.StudentGuardian WHERE studentId = @StudentId;
  UPDATE dbo.Guardian SET name = N'Former guardian', phone = N'0000000000', email = NULL, occupation = NULL, annualIncome = NULL, userId = NULL
   WHERE id IN (SELECT id FROM @guardians);

  -- Their sign-ins are disabled and renamed, so the username can be reused.
  UPDATE dbo.[User] SET isActive = 0, name = N'Deleted user', email = NULL, phone = NULL, username = CONCAT(N'deleted-', LOWER(CONVERT(NVARCHAR(36), id)))
   WHERE id = @userId OR id IN (SELECT userId FROM @guardians WHERE userId IS NOT NULL);
  DELETE FROM dbo.RefreshToken WHERE userId = @userId OR userId IN (SELECT userId FROM @guardians WHERE userId IS NOT NULL);
  COMMIT;
  SELECT N'anonymized' AS result;
END;
GO

-- The API may run the data-protection procedures; maintenance stays with administrators.
IF USER_ID(N'erp_app') IS NOT NULL
BEGIN
  GRANT EXECUTE ON dbo.usp_StudentDataExport TO [erp_app];
  GRANT EXECUTE ON dbo.usp_StudentAnonymize TO [erp_app];
END;
GO
