BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Plan] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [code] NVARCHAR(40) NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [pricePerBranch] DECIMAL(12,2) NOT NULL,
    [maxStudents] INT,
    [features] NVARCHAR(max) NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [Plan_isActive_df] DEFAULT 1,
    CONSTRAINT [Plan_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Plan_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[Organization] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [subdomain] NVARCHAR(60) NOT NULL,
    [logoUrl] NVARCHAR(500),
    [contactEmail] NVARCHAR(200) NOT NULL,
    [contactPhone] NVARCHAR(20) NOT NULL,
    [planId] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [Organization_status_df] DEFAULT 'TRIAL',
    [trialEndsAt] DATETIME2,
    [settings] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Organization_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Organization_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Organization_subdomain_key] UNIQUE NONCLUSTERED ([subdomain])
);

-- CreateTable
CREATE TABLE [dbo].[Subscription] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [planId] UNIQUEIDENTIFIER NOT NULL,
    [branchCount] INT NOT NULL,
    [amount] DECIMAL(12,2) NOT NULL,
    [billingCycle] NVARCHAR(10) NOT NULL,
    [status] NVARCHAR(20) NOT NULL,
    [currentPeriodStart] DATETIME2 NOT NULL,
    [currentPeriodEnd] DATETIME2 NOT NULL,
    [gatewayRef] NVARCHAR(100),
    CONSTRAINT [Subscription_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[SubscriptionInvoice] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [subscriptionId] UNIQUEIDENTIFIER NOT NULL,
    [number] NVARCHAR(40) NOT NULL,
    [amount] DECIMAL(12,2) NOT NULL,
    [gst] DECIMAL(12,2) NOT NULL,
    [status] NVARCHAR(20) NOT NULL,
    [issuedAt] DATETIME2 NOT NULL CONSTRAINT [SubscriptionInvoice_issuedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [paidAt] DATETIME2,
    CONSTRAINT [SubscriptionInvoice_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SubscriptionInvoice_number_key] UNIQUE NONCLUSTERED ([number])
);

-- CreateTable
CREATE TABLE [dbo].[Region] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    CONSTRAINT [Region_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Region_organizationId_name_key] UNIQUE NONCLUSTERED ([organizationId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[Branch] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [regionId] UNIQUEIDENTIFIER,
    [code] NVARCHAR(20) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [board] NVARCHAR(40),
    [affiliationNo] NVARCHAR(40),
    [address] NVARCHAR(500) NOT NULL,
    [city] NVARCHAR(100) NOT NULL,
    [state] NVARCHAR(100) NOT NULL,
    [phone] NVARCHAR(20),
    [email] NVARCHAR(200),
    [settings] NVARCHAR(max),
    [isActive] BIT NOT NULL CONSTRAINT [Branch_isActive_df] DEFAULT 1,
    CONSTRAINT [Branch_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Branch_organizationId_code_key] UNIQUE NONCLUSTERED ([organizationId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[AcademicYear] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(20) NOT NULL,
    [startDate] DATE NOT NULL,
    [endDate] DATE NOT NULL,
    [isCurrent] BIT NOT NULL CONSTRAINT [AcademicYear_isCurrent_df] DEFAULT 0,
    CONSTRAINT [AcademicYear_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AcademicYear_organizationId_name_key] UNIQUE NONCLUSTERED ([organizationId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[User] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [username] NVARCHAR(80) NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [email] NVARCHAR(200),
    [phone] NVARCHAR(20),
    [passwordHash] NVARCHAR(200) NOT NULL,
    [mustChangePassword] BIT NOT NULL CONSTRAINT [User_mustChangePassword_df] DEFAULT 1,
    [isActive] BIT NOT NULL CONSTRAINT [User_isActive_df] DEFAULT 1,
    [lastLoginAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [User_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [User_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [User_organizationId_username_key] UNIQUE NONCLUSTERED ([organizationId],[username])
);

-- CreateTable
CREATE TABLE [dbo].[Role] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER,
    [code] NVARCHAR(40) NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [level] NVARCHAR(10) NOT NULL,
    [isSystem] BIT NOT NULL CONSTRAINT [Role_isSystem_df] DEFAULT 0,
    CONSTRAINT [Role_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Role_organizationId_code_key] UNIQUE NONCLUSTERED ([organizationId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[Permission] (
    [code] NVARCHAR(60) NOT NULL,
    [module] NVARCHAR(40) NOT NULL,
    [description] NVARCHAR(200) NOT NULL,
    CONSTRAINT [Permission_pkey] PRIMARY KEY CLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[RolePermission] (
    [organizationId] UNIQUEIDENTIFIER,
    [roleId] UNIQUEIDENTIFIER NOT NULL,
    [permissionCode] NVARCHAR(60) NOT NULL,
    CONSTRAINT [RolePermission_pkey] PRIMARY KEY CLUSTERED ([roleId],[permissionCode])
);

-- CreateTable
CREATE TABLE [dbo].[Membership] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [roleId] UNIQUEIDENTIFIER NOT NULL,
    [scopeType] NVARCHAR(10) NOT NULL,
    [regionId] UNIQUEIDENTIFIER,
    [branchId] UNIQUEIDENTIFIER,
    [isActive] BIT NOT NULL CONSTRAINT [Membership_isActive_df] DEFAULT 1,
    CONSTRAINT [Membership_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[RefreshToken] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [tokenHash] NVARCHAR(200) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [revokedAt] DATETIME2,
    [userAgent] NVARCHAR(300),
    CONSTRAINT [RefreshToken_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PasswordResetToken] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [tokenHash] NVARCHAR(200) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [usedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PasswordResetToken_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PasswordResetToken_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[OtpCode] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [phone] NVARCHAR(20) NOT NULL,
    [purpose] NVARCHAR(15) NOT NULL,
    [codeHash] NVARCHAR(200) NOT NULL,
    [attempts] INT NOT NULL CONSTRAINT [OtpCode_attempts_df] DEFAULT 0,
    [expiresAt] DATETIME2 NOT NULL,
    [usedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [OtpCode_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [OtpCode_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Staff] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [userId] UNIQUEIDENTIFIER,
    [employeeCode] NVARCHAR(30) NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [gender] NVARCHAR(10),
    [dob] DATE,
    [phone] NVARCHAR(20),
    [email] NVARCHAR(200),
    [staffType] NVARCHAR(15) NOT NULL,
    [designation] NVARCHAR(100) NOT NULL,
    [department] NVARCHAR(100),
    [employmentType] NVARCHAR(20),
    [joiningDate] DATE,
    [status] NVARCHAR(15) NOT NULL CONSTRAINT [Staff_status_df] DEFAULT 'ACTIVE',
    [basicSalary] DECIMAL(12,2),
    [allowances] NVARCHAR(max),
    [bankAccount] NVARCHAR(max),
    [sensitive] NVARCHAR(max),
    [profile] NVARCHAR(max),
    CONSTRAINT [Staff_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Staff_organizationId_employeeCode_key] UNIQUE NONCLUSTERED ([organizationId],[employeeCode])
);

-- CreateTable
CREATE TABLE [dbo].[Student] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [userId] UNIQUEIDENTIFIER,
    [admissionNo] NVARCHAR(30) NOT NULL,
    [firstName] NVARCHAR(80) NOT NULL,
    [middleName] NVARCHAR(80),
    [lastName] NVARCHAR(80),
    [gender] NVARCHAR(10),
    [dob] DATE,
    [bloodGroup] NVARCHAR(5),
    [category] NVARCHAR(20),
    [religion] NVARCHAR(30),
    [aadhaarLast4] NVARCHAR(4),
    [admissionDate] DATE,
    [status] NVARCHAR(15) NOT NULL CONSTRAINT [Student_status_df] DEFAULT 'ACTIVE',
    [address] NVARCHAR(max),
    [health] NVARCHAR(max),
    [previousSchool] NVARCHAR(max),
    [sensitive] NVARCHAR(max),
    [profile] NVARCHAR(max),
    CONSTRAINT [Student_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Student_organizationId_admissionNo_key] UNIQUE NONCLUSTERED ([organizationId],[admissionNo])
);

-- CreateTable
CREATE TABLE [dbo].[Guardian] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [userId] UNIQUEIDENTIFIER,
    [name] NVARCHAR(150) NOT NULL,
    [phone] NVARCHAR(20) NOT NULL,
    [email] NVARCHAR(200),
    [occupation] NVARCHAR(100),
    [annualIncome] NVARCHAR(30),
    CONSTRAINT [Guardian_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[StudentGuardian] (
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [studentId] UNIQUEIDENTIFIER NOT NULL,
    [guardianId] UNIQUEIDENTIFIER NOT NULL,
    [relation] NVARCHAR(20) NOT NULL,
    [isPrimary] BIT NOT NULL CONSTRAINT [StudentGuardian_isPrimary_df] DEFAULT 0,
    CONSTRAINT [StudentGuardian_pkey] PRIMARY KEY CLUSTERED ([studentId],[guardianId])
);

-- CreateTable
CREATE TABLE [dbo].[Enrollment] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [studentId] UNIQUEIDENTIFIER NOT NULL,
    [academicYearId] UNIQUEIDENTIFIER NOT NULL,
    [sectionId] UNIQUEIDENTIFIER NOT NULL,
    [rollNo] NVARCHAR(10) NOT NULL,
    [status] NVARCHAR(15) NOT NULL CONSTRAINT [Enrollment_status_df] DEFAULT 'ACTIVE',
    CONSTRAINT [Enrollment_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Enrollment_studentId_academicYearId_key] UNIQUE NONCLUSTERED ([studentId],[academicYearId]),
    CONSTRAINT [Enrollment_sectionId_rollNo_key] UNIQUE NONCLUSTERED ([sectionId],[rollNo])
);

-- CreateTable
CREATE TABLE [dbo].[Grade] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(30) NOT NULL,
    [sortOrder] INT NOT NULL,
    [medium] NVARCHAR(30),
    CONSTRAINT [Grade_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Grade_branchId_name_key] UNIQUE NONCLUSTERED ([branchId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[Section] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [gradeId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(10) NOT NULL,
    [classTeacherId] UNIQUEIDENTIFIER,
    [capacity] INT NOT NULL CONSTRAINT [Section_capacity_df] DEFAULT 40,
    [room] NVARCHAR(30),
    CONSTRAINT [Section_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Section_gradeId_name_key] UNIQUE NONCLUSTERED ([gradeId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[Subject] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [code] NVARCHAR(20) NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    CONSTRAINT [Subject_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Subject_organizationId_code_key] UNIQUE NONCLUSTERED ([organizationId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[SectionSubject] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [academicYearId] UNIQUEIDENTIFIER NOT NULL,
    [sectionId] UNIQUEIDENTIFIER NOT NULL,
    [subjectId] UNIQUEIDENTIFIER NOT NULL,
    [teacherId] UNIQUEIDENTIFIER,
    CONSTRAINT [SectionSubject_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SectionSubject_academicYearId_sectionId_subjectId_key] UNIQUE NONCLUSTERED ([academicYearId],[sectionId],[subjectId])
);

-- CreateTable
CREATE TABLE [dbo].[TimetablePeriod] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [sectionSubjectId] UNIQUEIDENTIFIER NOT NULL,
    [dayOfWeek] INT NOT NULL,
    [periodNo] INT NOT NULL,
    [startTime] NVARCHAR(5) NOT NULL,
    [endTime] NVARCHAR(5) NOT NULL,
    CONSTRAINT [TimetablePeriod_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Exam] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER,
    [academicYearId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(60) NOT NULL,
    [gradeNames] NVARCHAR(200) NOT NULL,
    [resultsPublished] BIT NOT NULL CONSTRAINT [Exam_resultsPublished_df] DEFAULT 0,
    [publishedAt] DATETIME2,
    CONSTRAINT [Exam_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ExamPaper] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [examId] UNIQUEIDENTIFIER NOT NULL,
    [subjectId] UNIQUEIDENTIFIER NOT NULL,
    [date] DATE NOT NULL,
    [startTime] NVARCHAR(5) NOT NULL,
    [endTime] NVARCHAR(5) NOT NULL,
    [maxMarks] DECIMAL(6,2) NOT NULL,
    [passMarks] DECIMAL(6,2) NOT NULL,
    CONSTRAINT [ExamPaper_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Mark] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [examPaperId] UNIQUEIDENTIFIER NOT NULL,
    [studentId] UNIQUEIDENTIFIER NOT NULL,
    [marks] DECIMAL(6,2),
    [isAbsent] BIT NOT NULL CONSTRAINT [Mark_isAbsent_df] DEFAULT 0,
    [enteredById] UNIQUEIDENTIFIER NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Mark_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Mark_examPaperId_studentId_key] UNIQUE NONCLUSTERED ([examPaperId],[studentId])
);

-- CreateTable
CREATE TABLE [dbo].[AttendanceSession] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [sectionId] UNIQUEIDENTIFIER NOT NULL,
    [date] DATE NOT NULL,
    [periodNo] INT,
    [subjectId] UNIQUEIDENTIFIER,
    [takenById] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [AttendanceSession_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AttendanceSession_sectionId_date_periodNo_key] UNIQUE NONCLUSTERED ([sectionId],[date],[periodNo])
);

-- CreateTable
CREATE TABLE [dbo].[AttendanceEntry] (
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [sessionId] UNIQUEIDENTIFIER NOT NULL,
    [studentId] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(10) NOT NULL,
    CONSTRAINT [AttendanceEntry_pkey] PRIMARY KEY CLUSTERED ([sessionId],[studentId])
);

-- CreateTable
CREATE TABLE [dbo].[Assignment] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [sectionId] UNIQUEIDENTIFIER NOT NULL,
    [subjectId] UNIQUEIDENTIFIER NOT NULL,
    [teacherId] UNIQUEIDENTIFIER NOT NULL,
    [title] NVARCHAR(200) NOT NULL,
    [description] NVARCHAR(max),
    [assignedDate] DATE NOT NULL,
    [dueDate] DATE NOT NULL,
    [totalMarks] DECIMAL(6,2) NOT NULL,
    CONSTRAINT [Assignment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AssignmentSubmission] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [assignmentId] UNIQUEIDENTIFIER NOT NULL,
    [studentId] UNIQUEIDENTIFIER NOT NULL,
    [submittedAt] DATETIME2 NOT NULL,
    [fileId] UNIQUEIDENTIFIER,
    [marksObtained] DECIMAL(6,2),
    [feedback] NVARCHAR(1000),
    [gradedById] UNIQUEIDENTIFIER,
    CONSTRAINT [AssignmentSubmission_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AssignmentSubmission_assignmentId_studentId_key] UNIQUE NONCLUSTERED ([assignmentId],[studentId])
);

-- CreateTable
CREATE TABLE [dbo].[StudyNote] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [sectionId] UNIQUEIDENTIFIER NOT NULL,
    [subjectId] UNIQUEIDENTIFIER NOT NULL,
    [uploadedById] UNIQUEIDENTIFIER NOT NULL,
    [title] NVARCHAR(200) NOT NULL,
    [description] NVARCHAR(1000),
    [fileId] UNIQUEIDENTIFIER NOT NULL,
    [downloads] INT NOT NULL CONSTRAINT [StudyNote_downloads_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [StudyNote_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [StudyNote_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Attachment] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER,
    [fileName] NVARCHAR(260) NOT NULL,
    [mimeType] NVARCHAR(100) NOT NULL,
    [sizeBytes] INT NOT NULL,
    [storageKey] NVARCHAR(500) NOT NULL,
    [uploadedById] UNIQUEIDENTIFIER,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Attachment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Attachment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[FeePlan] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [academicYearId] UNIQUEIDENTIFIER NOT NULL,
    [gradeId] UNIQUEIDENTIFIER NOT NULL,
    [feeHead] NVARCHAR(30) NOT NULL CONSTRAINT [FeePlan_feeHead_df] DEFAULT 'TUITION',
    [annualAmount] DECIMAL(12,2) NOT NULL,
    CONSTRAINT [FeePlan_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FeePlan_academicYearId_gradeId_feeHead_key] UNIQUE NONCLUSTERED ([academicYearId],[gradeId],[feeHead])
);

-- CreateTable
CREATE TABLE [dbo].[FeeInstallment] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [feePlanId] UNIQUEIDENTIFIER NOT NULL,
    [installmentNo] INT NOT NULL,
    [name] NVARCHAR(60) NOT NULL,
    [dueDate] DATE NOT NULL,
    [percent] DECIMAL(5,2) NOT NULL,
    CONSTRAINT [FeeInstallment_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FeeInstallment_feePlanId_installmentNo_key] UNIQUE NONCLUSTERED ([feePlanId],[installmentNo])
);

-- CreateTable
CREATE TABLE [dbo].[FeeConcession] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [studentId] UNIQUEIDENTIFIER NOT NULL,
    [academicYearId] UNIQUEIDENTIFIER NOT NULL,
    [type] NVARCHAR(30) NOT NULL,
    [percent] DECIMAL(5,2) NOT NULL,
    [approvedById] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [FeeConcession_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FeeConcession_studentId_academicYearId_type_key] UNIQUE NONCLUSTERED ([studentId],[academicYearId],[type])
);

-- CreateTable
CREATE TABLE [dbo].[FeePayment] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [studentId] UNIQUEIDENTIFIER NOT NULL,
    [installmentId] UNIQUEIDENTIFIER NOT NULL,
    [amount] DECIMAL(12,2) NOT NULL,
    [lateFee] DECIMAL(12,2) NOT NULL CONSTRAINT [FeePayment_lateFee_df] DEFAULT 0,
    [method] NVARCHAR(20) NOT NULL,
    [status] NVARCHAR(15) NOT NULL,
    [receiptNo] NVARCHAR(40) NOT NULL,
    [gatewayRef] NVARCHAR(100),
    [idempotencyKey] NVARCHAR(100) NOT NULL,
    [receivedById] UNIQUEIDENTIFIER,
    [paidAt] DATETIME2 NOT NULL,
    CONSTRAINT [FeePayment_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FeePayment_idempotencyKey_key] UNIQUE NONCLUSTERED ([idempotencyKey]),
    CONSTRAINT [FeePayment_organizationId_receiptNo_key] UNIQUE NONCLUSTERED ([organizationId],[receiptNo])
);

-- CreateTable
CREATE TABLE [dbo].[Expense] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [date] DATE NOT NULL,
    [category] NVARCHAR(40) NOT NULL,
    [description] NVARCHAR(300) NOT NULL,
    [amount] DECIMAL(12,2) NOT NULL,
    [paidTo] NVARCHAR(150),
    [method] NVARCHAR(20) NOT NULL,
    [createdById] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [Expense_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PayrollRun] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [month] NVARCHAR(7) NOT NULL,
    [status] NVARCHAR(15) NOT NULL,
    [processedAt] DATETIME2 NOT NULL,
    [paidAt] DATETIME2,
    CONSTRAINT [PayrollRun_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PayrollRun_branchId_month_key] UNIQUE NONCLUSTERED ([branchId],[month])
);

-- CreateTable
CREATE TABLE [dbo].[Payslip] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [payrollRunId] UNIQUEIDENTIFIER NOT NULL,
    [staffId] UNIQUEIDENTIFIER NOT NULL,
    [gross] DECIMAL(12,2) NOT NULL,
    [deductions] DECIMAL(12,2) NOT NULL,
    [net] DECIMAL(12,2) NOT NULL,
    [breakdown] NVARCHAR(max) NOT NULL,
    CONSTRAINT [Payslip_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Payslip_payrollRunId_staffId_key] UNIQUE NONCLUSTERED ([payrollRunId],[staffId])
);

-- CreateTable
CREATE TABLE [dbo].[LeaveRequest] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [staffId] UNIQUEIDENTIFIER NOT NULL,
    [type] NVARCHAR(15) NOT NULL,
    [fromDate] DATE NOT NULL,
    [toDate] DATE NOT NULL,
    [reason] NVARCHAR(500) NOT NULL,
    [status] NVARCHAR(10) NOT NULL CONSTRAINT [LeaveRequest_status_df] DEFAULT 'PENDING',
    [decidedById] UNIQUEIDENTIFIER,
    [decidedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LeaveRequest_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [LeaveRequest_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Announcement] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER,
    [title] NVARCHAR(200) NOT NULL,
    [body] NVARCHAR(max) NOT NULL,
    [category] NVARCHAR(20) NOT NULL,
    [priority] NVARCHAR(10) NOT NULL,
    [createdById] UNIQUEIDENTIFIER NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Announcement_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Announcement_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AnnouncementAudience] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [announcementId] UNIQUEIDENTIFIER NOT NULL,
    [audienceType] NVARCHAR(15) NOT NULL,
    [sectionId] UNIQUEIDENTIFIER,
    CONSTRAINT [AnnouncementAudience_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Message] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [fromUserId] UNIQUEIDENTIFIER NOT NULL,
    [toUserId] UNIQUEIDENTIFIER NOT NULL,
    [aboutStudentId] UNIQUEIDENTIFIER,
    [subject] NVARCHAR(200) NOT NULL,
    [body] NVARCHAR(max) NOT NULL,
    [sentAt] DATETIME2 NOT NULL CONSTRAINT [Message_sentAt_df] DEFAULT CURRENT_TIMESTAMP,
    [readAt] DATETIME2,
    CONSTRAINT [Message_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Notification] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER,
    [channel] NVARCHAR(10) NOT NULL,
    [toAddress] NVARCHAR(200) NOT NULL,
    [template] NVARCHAR(60) NOT NULL,
    [payload] NVARCHAR(max) NOT NULL,
    [status] NVARCHAR(10) NOT NULL,
    [sentAt] DATETIME2,
    CONSTRAINT [Notification_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Book] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [title] NVARCHAR(300) NOT NULL,
    [author] NVARCHAR(200) NOT NULL,
    [isbn] NVARCHAR(20),
    [category] NVARCHAR(50) NOT NULL,
    [publisher] NVARCHAR(150),
    [edition] NVARCHAR(50),
    [publishYear] INT,
    [totalCopies] INT NOT NULL,
    [rack] NVARCHAR(20),
    CONSTRAINT [Book_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[BookLoan] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [bookId] UNIQUEIDENTIFIER NOT NULL,
    [studentId] UNIQUEIDENTIFIER,
    [staffId] UNIQUEIDENTIFIER,
    [issueDate] DATE NOT NULL,
    [dueDate] DATE NOT NULL,
    [returnDate] DATE,
    [finePaid] DECIMAL(10,2) NOT NULL CONSTRAINT [BookLoan_finePaid_df] DEFAULT 0,
    CONSTRAINT [BookLoan_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[InventoryItem] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [sku] NVARCHAR(40) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [category] NVARCHAR(60) NOT NULL,
    [unit] NVARCHAR(20) NOT NULL,
    [location] NVARCHAR(100) NOT NULL,
    [quantity] INT NOT NULL,
    [minQuantity] INT NOT NULL,
    [unitPrice] DECIMAL(12,2) NOT NULL,
    [condition] NVARCHAR(15) NOT NULL,
    CONSTRAINT [InventoryItem_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [InventoryItem_branchId_sku_key] UNIQUE NONCLUSTERED ([branchId],[sku])
);

-- CreateTable
CREATE TABLE [dbo].[StockMovement] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [itemId] UNIQUEIDENTIFIER NOT NULL,
    [type] NVARCHAR(5) NOT NULL,
    [quantity] INT NOT NULL,
    [note] NVARCHAR(300),
    [createdById] UNIQUEIDENTIFIER NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [StockMovement_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [StockMovement_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Vehicle] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [registrationNo] NVARCHAR(20) NOT NULL,
    [type] NVARCHAR(15) NOT NULL,
    [capacity] INT NOT NULL,
    [driverStaffId] UNIQUEIDENTIFIER,
    [insuranceExpiry] DATE NOT NULL,
    [fitnessExpiry] DATE NOT NULL,
    CONSTRAINT [Vehicle_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Vehicle_organizationId_registrationNo_key] UNIQUE NONCLUSTERED ([organizationId],[registrationNo])
);

-- CreateTable
CREATE TABLE [dbo].[TransportRoute] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(60) NOT NULL,
    [vehicleId] UNIQUEIDENTIFIER,
    [monthlyFee] DECIMAL(10,2) NOT NULL,
    [pickupTime] NVARCHAR(5) NOT NULL,
    CONSTRAINT [TransportRoute_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [TransportRoute_branchId_name_key] UNIQUE NONCLUSTERED ([branchId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[RouteStop] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [routeId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [sortOrder] INT NOT NULL,
    CONSTRAINT [RouteStop_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[TransportAllocation] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [studentId] UNIQUEIDENTIFIER NOT NULL,
    [academicYearId] UNIQUEIDENTIFIER NOT NULL,
    [stopId] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [TransportAllocation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [TransportAllocation_studentId_academicYearId_key] UNIQUE NONCLUSTERED ([studentId],[academicYearId])
);

-- CreateTable
CREATE TABLE [dbo].[HostelRoom] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [block] NVARCHAR(20) NOT NULL,
    [number] NVARCHAR(20) NOT NULL,
    [capacity] INT NOT NULL,
    [type] NVARCHAR(10) NOT NULL,
    CONSTRAINT [HostelRoom_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [HostelRoom_branchId_block_number_key] UNIQUE NONCLUSTERED ([branchId],[block],[number])
);

-- CreateTable
CREATE TABLE [dbo].[HostelAllocation] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [roomId] UNIQUEIDENTIFIER NOT NULL,
    [studentId] UNIQUEIDENTIFIER NOT NULL,
    [fromDate] DATE NOT NULL,
    [toDate] DATE,
    CONSTRAINT [HostelAllocation_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Outpass] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [studentId] UNIQUEIDENTIFIER NOT NULL,
    [fromDate] DATE NOT NULL,
    [toDate] DATE NOT NULL,
    [reason] NVARCHAR(300) NOT NULL,
    [status] NVARCHAR(10) NOT NULL,
    [decidedById] UNIQUEIDENTIFIER,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Outpass_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Outpass_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Enquiry] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [studentName] NVARCHAR(150) NOT NULL,
    [parentName] NVARCHAR(150) NOT NULL,
    [phone] NVARCHAR(20) NOT NULL,
    [email] NVARCHAR(200),
    [gradeName] NVARCHAR(30) NOT NULL,
    [source] NVARCHAR(30) NOT NULL,
    [status] NVARCHAR(20) NOT NULL,
    [notes] NVARCHAR(1000),
    [followUpDate] DATE,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Enquiry_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Enquiry_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Visitor] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [phone] NVARCHAR(20),
    [purpose] NVARCHAR(60) NOT NULL,
    [toMeet] NVARCHAR(150) NOT NULL,
    [people] INT NOT NULL CONSTRAINT [Visitor_people_df] DEFAULT 1,
    [inAt] DATETIME2 NOT NULL,
    [outAt] DATETIME2,
    CONSTRAINT [Visitor_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Vendor] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [category] NVARCHAR(100),
    [gstin] NVARCHAR(15),
    [pan] NVARCHAR(10),
    [phone] NVARCHAR(20),
    [email] NVARCHAR(200),
    [address] NVARCHAR(500),
    [bankAccount] NVARCHAR(max),
    [tdsSection] NVARCHAR(5) NOT NULL CONSTRAINT [Vendor_tdsSection_df] DEFAULT '194C',
    [isIndividual] BIT NOT NULL CONSTRAINT [Vendor_isIndividual_df] DEFAULT 0,
    [isActive] BIT NOT NULL CONSTRAINT [Vendor_isActive_df] DEFAULT 1,
    CONSTRAINT [Vendor_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Vendor_organizationId_name_key] UNIQUE NONCLUSTERED ([organizationId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[Indent] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [no] NVARCHAR(30) NOT NULL,
    [requestedById] UNIQUEIDENTIFIER NOT NULL,
    [requesterName] NVARCHAR(150) NOT NULL,
    [department] NVARCHAR(100) NOT NULL,
    [location] NVARCHAR(150) NOT NULL,
    [purpose] NVARCHAR(1000) NOT NULL,
    [priority] NVARCHAR(10) NOT NULL CONSTRAINT [Indent_priority_df] DEFAULT 'NORMAL',
    [neededBy] DATE NOT NULL,
    [status] NVARCHAR(25) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Indent_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Indent_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Indent_organizationId_no_key] UNIQUE NONCLUSTERED ([organizationId],[no])
);

-- CreateTable
CREATE TABLE [dbo].[IndentLine] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [indentId] UNIQUEIDENTIFIER NOT NULL,
    [lineNo] INT NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [qty] INT NOT NULL,
    [unit] NVARCHAR(20) NOT NULL,
    [estRate] DECIMAL(12,2) NOT NULL,
    [inventoryItemId] UNIQUEIDENTIFIER,
    [category] NVARCHAR(60),
    [issuedFromStock] INT,
    [toPurchase] INT,
    CONSTRAINT [IndentLine_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [IndentLine_indentId_lineNo_key] UNIQUE NONCLUSTERED ([indentId],[lineNo])
);

-- CreateTable
CREATE TABLE [dbo].[IndentEvent] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [indentId] UNIQUEIDENTIFIER NOT NULL,
    [at] DATETIME2 NOT NULL CONSTRAINT [IndentEvent_at_df] DEFAULT CURRENT_TIMESTAMP,
    [byUserId] UNIQUEIDENTIFIER,
    [byName] NVARCHAR(150) NOT NULL,
    [role] NVARCHAR(20) NOT NULL,
    [action] NVARCHAR(100) NOT NULL,
    [remark] NVARCHAR(1000),
    CONSTRAINT [IndentEvent_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Quotation] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [indentId] UNIQUEIDENTIFIER NOT NULL,
    [vendorId] UNIQUEIDENTIFIER NOT NULL,
    [gstPercent] DECIMAL(5,2) NOT NULL,
    [deliveryDays] INT NOT NULL,
    [validTill] DATE NOT NULL,
    [notes] NVARCHAR(500),
    [receivedAt] DATETIME2 NOT NULL CONSTRAINT [Quotation_receivedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Quotation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Quotation_indentId_vendorId_key] UNIQUE NONCLUSTERED ([indentId],[vendorId])
);

-- CreateTable
CREATE TABLE [dbo].[QuotationLine] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [quotationId] UNIQUEIDENTIFIER NOT NULL,
    [lineNo] INT NOT NULL,
    [rate] DECIMAL(12,2) NOT NULL,
    CONSTRAINT [QuotationLine_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [QuotationLine_quotationId_lineNo_key] UNIQUE NONCLUSTERED ([quotationId],[lineNo])
);

-- CreateTable
CREATE TABLE [dbo].[PurchaseOrder] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [no] NVARCHAR(30) NOT NULL,
    [indentId] UNIQUEIDENTIFIER NOT NULL,
    [vendorId] UNIQUEIDENTIFIER NOT NULL,
    [quotationId] UNIQUEIDENTIFIER NOT NULL,
    [orderDate] DATE NOT NULL,
    [deliveryBy] DATE NOT NULL,
    [gstPercent] DECIMAL(5,2) NOT NULL,
    [status] NVARCHAR(20) NOT NULL,
    [selectionNote] NVARCHAR(500),
    [createdById] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [PurchaseOrder_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PurchaseOrder_organizationId_no_key] UNIQUE NONCLUSTERED ([organizationId],[no])
);

-- CreateTable
CREATE TABLE [dbo].[PurchaseOrderLine] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [poId] UNIQUEIDENTIFIER NOT NULL,
    [lineNo] INT NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [qty] INT NOT NULL,
    [unit] NVARCHAR(20) NOT NULL,
    [rate] DECIMAL(12,2) NOT NULL,
    [received] INT NOT NULL CONSTRAINT [PurchaseOrderLine_received_df] DEFAULT 0,
    [accepted] INT NOT NULL CONSTRAINT [PurchaseOrderLine_accepted_df] DEFAULT 0,
    CONSTRAINT [PurchaseOrderLine_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PurchaseOrderLine_poId_lineNo_key] UNIQUE NONCLUSTERED ([poId],[lineNo])
);

-- CreateTable
CREATE TABLE [dbo].[GoodsReceipt] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [no] NVARCHAR(30) NOT NULL,
    [poId] UNIQUEIDENTIFIER NOT NULL,
    [receivedOn] DATE NOT NULL,
    [receivedById] UNIQUEIDENTIFIER NOT NULL,
    [checkedBy] NVARCHAR(150) NOT NULL,
    [challanNo] NVARCHAR(60) NOT NULL,
    CONSTRAINT [GoodsReceipt_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [GoodsReceipt_organizationId_no_key] UNIQUE NONCLUSTERED ([organizationId],[no])
);

-- CreateTable
CREATE TABLE [dbo].[GoodsReceiptLine] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [grnId] UNIQUEIDENTIFIER NOT NULL,
    [lineNo] INT NOT NULL,
    [received] INT NOT NULL,
    [accepted] INT NOT NULL,
    [rejectedReason] NVARCHAR(300),
    CONSTRAINT [GoodsReceiptLine_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [GoodsReceiptLine_grnId_lineNo_key] UNIQUE NONCLUSTERED ([grnId],[lineNo])
);

-- CreateTable
CREATE TABLE [dbo].[VendorBill] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [poId] UNIQUEIDENTIFIER NOT NULL,
    [vendorId] UNIQUEIDENTIFIER NOT NULL,
    [billNo] NVARCHAR(60) NOT NULL,
    [billDate] DATE NOT NULL,
    [subtotal] DECIMAL(12,2) NOT NULL,
    [gst] DECIMAL(12,2) NOT NULL,
    [total] DECIMAL(12,2) NOT NULL,
    [expected] DECIMAL(12,2) NOT NULL,
    [status] NVARCHAR(10) NOT NULL,
    [note] NVARCHAR(500),
    [enteredById] UNIQUEIDENTIFIER NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [VendorBill_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [VendorBill_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [VendorBill_vendorId_billNo_key] UNIQUE NONCLUSTERED ([vendorId],[billNo])
);

-- CreateTable
CREATE TABLE [dbo].[VendorPayment] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [billId] UNIQUEIDENTIFIER NOT NULL,
    [vendorId] UNIQUEIDENTIFIER NOT NULL,
    [paidOn] DATE NOT NULL,
    [gross] DECIMAL(12,2) NOT NULL,
    [tdsSection] NVARCHAR(5) NOT NULL,
    [tds] DECIMAL(12,2) NOT NULL,
    [net] DECIMAL(12,2) NOT NULL,
    [mode] NVARCHAR(10) NOT NULL,
    [reference] NVARCHAR(60) NOT NULL,
    [expenseId] UNIQUEIDENTIFIER,
    [paidById] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [VendorPayment_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [VendorPayment_billId_key] UNIQUE NONCLUSTERED ([billId])
);

-- CreateTable
CREATE TABLE [dbo].[PettyCashVoucher] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [voucherDate] DATE NOT NULL,
    [kind] NVARCHAR(6) NOT NULL,
    [purpose] NVARCHAR(300) NOT NULL,
    [paidTo] NVARCHAR(150) NOT NULL,
    [category] NVARCHAR(40),
    [amount] DECIMAL(10,2) NOT NULL,
    [expenseId] UNIQUEIDENTIFIER,
    [approvedById] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [PettyCashVoucher_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Holiday] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER,
    [academicYearId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [startDate] DATE NOT NULL,
    [endDate] DATE NOT NULL,
    [type] NVARCHAR(10) NOT NULL,
    CONSTRAINT [Holiday_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[StudentTransfer] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [studentId] UNIQUEIDENTIFIER NOT NULL,
    [fromBranchId] UNIQUEIDENTIFIER NOT NULL,
    [toBranchId] UNIQUEIDENTIFIER NOT NULL,
    [academicYearId] UNIQUEIDENTIFIER NOT NULL,
    [transferDate] DATE NOT NULL,
    [reason] NVARCHAR(500),
    [approvedById] UNIQUEIDENTIFIER NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [StudentTransfer_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [StudentTransfer_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[GradingScale] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(60) NOT NULL,
    [bands] NVARCHAR(max) NOT NULL,
    [isDefault] BIT NOT NULL CONSTRAINT [GradingScale_isDefault_df] DEFAULT 0,
    CONSTRAINT [GradingScale_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [GradingScale_organizationId_name_key] UNIQUE NONCLUSTERED ([organizationId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[PaymentOrder] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [studentId] UNIQUEIDENTIFIER NOT NULL,
    [installmentId] UNIQUEIDENTIFIER NOT NULL,
    [amount] DECIMAL(12,2) NOT NULL,
    [lateFee] DECIMAL(12,2) NOT NULL CONSTRAINT [PaymentOrder_lateFee_df] DEFAULT 0,
    [gateway] NVARCHAR(20) NOT NULL,
    [gatewayOrderId] NVARCHAR(100) NOT NULL,
    [status] NVARCHAR(10) NOT NULL,
    [feePaymentId] UNIQUEIDENTIFIER,
    [createdById] UNIQUEIDENTIFIER,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PaymentOrder_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [PaymentOrder_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PaymentOrder_gateway_gatewayOrderId_key] UNIQUE NONCLUSTERED ([gateway],[gatewayOrderId])
);

-- CreateTable
CREATE TABLE [dbo].[PaymentWebhookEvent] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [gateway] NVARCHAR(20) NOT NULL,
    [eventId] NVARCHAR(100) NOT NULL,
    [eventType] NVARCHAR(60) NOT NULL,
    [payload] NVARCHAR(max) NOT NULL,
    [receivedAt] DATETIME2 NOT NULL CONSTRAINT [PaymentWebhookEvent_receivedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [processedAt] DATETIME2,
    [error] NVARCHAR(1000),
    CONSTRAINT [PaymentWebhookEvent_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PaymentWebhookEvent_gateway_eventId_key] UNIQUE NONCLUSTERED ([gateway],[eventId])
);

-- CreateTable
CREATE TABLE [dbo].[DemoLead] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [institution] NVARCHAR(200) NOT NULL,
    [role] NVARCHAR(60),
    [phone] NVARCHAR(20) NOT NULL,
    [email] NVARCHAR(200),
    [city] NVARCHAR(100) NOT NULL,
    [campuses] NVARCHAR(20),
    [students] NVARCHAR(30),
    [message] NVARCHAR(1000),
    [status] NVARCHAR(15) NOT NULL CONSTRAINT [DemoLead_status_df] DEFAULT 'NEW',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DemoLead_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [DemoLead_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[JobOpening] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [campus] NVARCHAR(150),
    [title] NVARCHAR(150) NOT NULL,
    [department] NVARCHAR(100) NOT NULL,
    [category] NVARCHAR(20) NOT NULL,
    [employmentType] NVARCHAR(20) NOT NULL,
    [vacancies] INT NOT NULL,
    [qualification] NVARCHAR(300) NOT NULL,
    [experience] NVARCHAR(200),
    [salary] NVARCHAR(100),
    [description] NVARCHAR(max) NOT NULL,
    [responsibilities] NVARCHAR(max),
    [postedOn] DATE NOT NULL,
    [lastDate] DATE NOT NULL,
    [isOpen] BIT NOT NULL CONSTRAINT [JobOpening_isOpen_df] DEFAULT 1,
    CONSTRAINT [JobOpening_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[JobApplication] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [jobOpeningId] UNIQUEIDENTIFIER,
    [name] NVARCHAR(150) NOT NULL,
    [email] NVARCHAR(200) NOT NULL,
    [phone] NVARCHAR(20) NOT NULL,
    [qualification] NVARCHAR(300) NOT NULL,
    [experienceYears] INT NOT NULL,
    [currentEmployer] NVARCHAR(150),
    [expectedSalary] NVARCHAR(60),
    [coverLetter] NVARCHAR(max),
    [resumeFileId] UNIQUEIDENTIFIER,
    [status] NVARCHAR(15) NOT NULL CONSTRAINT [JobApplication_status_df] DEFAULT 'APPLIED',
    [interviewDate] DATE,
    [notes] NVARCHAR(1000),
    [appliedAt] DATETIME2 NOT NULL CONSTRAINT [JobApplication_appliedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [JobApplication_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ContactMessage] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER,
    [kind] NVARCHAR(15) NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [phone] NVARCHAR(20) NOT NULL,
    [email] NVARCHAR(200),
    [subject] NVARCHAR(200) NOT NULL,
    [message] NVARCHAR(max) NOT NULL,
    [resolved] BIT NOT NULL CONSTRAINT [ContactMessage_resolved_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ContactMessage_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ContactMessage_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AlumniMember] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [batchYear] INT NOT NULL,
    [email] NVARCHAR(200) NOT NULL,
    [phone] NVARCHAR(20),
    [occupation] NVARCHAR(150),
    [city] NVARCHAR(100),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AlumniMember_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AlumniMember_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AuditLog] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organizationId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER,
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [action] NVARCHAR(20) NOT NULL,
    [entity] NVARCHAR(60) NOT NULL,
    [entityId] NVARCHAR(60),
    [before] NVARCHAR(max),
    [after] NVARCHAR(max),
    [ip] NVARCHAR(45),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AuditLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AuditLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Subscription_organizationId_idx] ON [dbo].[Subscription]([organizationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [User_organizationId_phone_idx] ON [dbo].[User]([organizationId], [phone]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Membership_organizationId_userId_idx] ON [dbo].[Membership]([organizationId], [userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RefreshToken_userId_idx] ON [dbo].[RefreshToken]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RefreshToken_tokenHash_idx] ON [dbo].[RefreshToken]([tokenHash]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PasswordResetToken_tokenHash_idx] ON [dbo].[PasswordResetToken]([tokenHash]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PasswordResetToken_userId_idx] ON [dbo].[PasswordResetToken]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OtpCode_organizationId_phone_createdAt_idx] ON [dbo].[OtpCode]([organizationId], [phone], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Staff_organizationId_branchId_idx] ON [dbo].[Staff]([organizationId], [branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Student_organizationId_branchId_idx] ON [dbo].[Student]([organizationId], [branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Guardian_organizationId_phone_idx] ON [dbo].[Guardian]([organizationId], [phone]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Enrollment_organizationId_branchId_academicYearId_idx] ON [dbo].[Enrollment]([organizationId], [branchId], [academicYearId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [TimetablePeriod_organizationId_branchId_dayOfWeek_idx] ON [dbo].[TimetablePeriod]([organizationId], [branchId], [dayOfWeek]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Exam_organizationId_branchId_academicYearId_idx] ON [dbo].[Exam]([organizationId], [branchId], [academicYearId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AttendanceSession_organizationId_branchId_date_idx] ON [dbo].[AttendanceSession]([organizationId], [branchId], [date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AttendanceEntry_studentId_idx] ON [dbo].[AttendanceEntry]([studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Assignment_organizationId_branchId_sectionId_idx] ON [dbo].[Assignment]([organizationId], [branchId], [sectionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StudyNote_organizationId_branchId_sectionId_idx] ON [dbo].[StudyNote]([organizationId], [branchId], [sectionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FeePayment_organizationId_branchId_paidAt_idx] ON [dbo].[FeePayment]([organizationId], [branchId], [paidAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FeePayment_studentId_idx] ON [dbo].[FeePayment]([studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Expense_organizationId_branchId_date_idx] ON [dbo].[Expense]([organizationId], [branchId], [date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LeaveRequest_organizationId_branchId_status_idx] ON [dbo].[LeaveRequest]([organizationId], [branchId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Announcement_organizationId_branchId_createdAt_idx] ON [dbo].[Announcement]([organizationId], [branchId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Message_organizationId_toUserId_sentAt_idx] ON [dbo].[Message]([organizationId], [toUserId], [sentAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Notification_organizationId_status_idx] ON [dbo].[Notification]([organizationId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Book_organizationId_branchId_idx] ON [dbo].[Book]([organizationId], [branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BookLoan_organizationId_branchId_returnDate_idx] ON [dbo].[BookLoan]([organizationId], [branchId], [returnDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [HostelAllocation_studentId_idx] ON [dbo].[HostelAllocation]([studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Outpass_organizationId_branchId_status_idx] ON [dbo].[Outpass]([organizationId], [branchId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Enquiry_organizationId_branchId_status_idx] ON [dbo].[Enquiry]([organizationId], [branchId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Visitor_organizationId_branchId_inAt_idx] ON [dbo].[Visitor]([organizationId], [branchId], [inAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Indent_organizationId_branchId_status_idx] ON [dbo].[Indent]([organizationId], [branchId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IndentEvent_indentId_at_idx] ON [dbo].[IndentEvent]([indentId], [at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PurchaseOrder_organizationId_branchId_status_idx] ON [dbo].[PurchaseOrder]([organizationId], [branchId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [VendorBill_organizationId_branchId_status_idx] ON [dbo].[VendorBill]([organizationId], [branchId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [VendorPayment_organizationId_branchId_paidOn_idx] ON [dbo].[VendorPayment]([organizationId], [branchId], [paidOn]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PettyCashVoucher_organizationId_branchId_voucherDate_idx] ON [dbo].[PettyCashVoucher]([organizationId], [branchId], [voucherDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Holiday_organizationId_academicYearId_startDate_idx] ON [dbo].[Holiday]([organizationId], [academicYearId], [startDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StudentTransfer_organizationId_studentId_idx] ON [dbo].[StudentTransfer]([organizationId], [studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PaymentOrder_organizationId_studentId_idx] ON [dbo].[PaymentOrder]([organizationId], [studentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [DemoLead_status_createdAt_idx] ON [dbo].[DemoLead]([status], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [JobOpening_organizationId_branchId_isOpen_idx] ON [dbo].[JobOpening]([organizationId], [branchId], [isOpen]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [JobApplication_organizationId_branchId_status_idx] ON [dbo].[JobApplication]([organizationId], [branchId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ContactMessage_organizationId_resolved_createdAt_idx] ON [dbo].[ContactMessage]([organizationId], [resolved], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AlumniMember_organizationId_batchYear_idx] ON [dbo].[AlumniMember]([organizationId], [batchYear]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_organizationId_entity_createdAt_idx] ON [dbo].[AuditLog]([organizationId], [entity], [createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[Organization] ADD CONSTRAINT [Organization_planId_fkey] FOREIGN KEY ([planId]) REFERENCES [dbo].[Plan]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Subscription] ADD CONSTRAINT [Subscription_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[Organization]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Subscription] ADD CONSTRAINT [Subscription_planId_fkey] FOREIGN KEY ([planId]) REFERENCES [dbo].[Plan]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SubscriptionInvoice] ADD CONSTRAINT [SubscriptionInvoice_subscriptionId_fkey] FOREIGN KEY ([subscriptionId]) REFERENCES [dbo].[Subscription]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Region] ADD CONSTRAINT [Region_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[Organization]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Branch] ADD CONSTRAINT [Branch_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[Organization]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Branch] ADD CONSTRAINT [Branch_regionId_fkey] FOREIGN KEY ([regionId]) REFERENCES [dbo].[Region]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcademicYear] ADD CONSTRAINT [AcademicYear_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[Organization]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[User] ADD CONSTRAINT [User_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[Organization]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Role] ADD CONSTRAINT [Role_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[Organization]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RolePermission] ADD CONSTRAINT [RolePermission_roleId_fkey] FOREIGN KEY ([roleId]) REFERENCES [dbo].[Role]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RolePermission] ADD CONSTRAINT [RolePermission_permissionCode_fkey] FOREIGN KEY ([permissionCode]) REFERENCES [dbo].[Permission]([code]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Membership] ADD CONSTRAINT [Membership_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Membership] ADD CONSTRAINT [Membership_roleId_fkey] FOREIGN KEY ([roleId]) REFERENCES [dbo].[Role]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Membership] ADD CONSTRAINT [Membership_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RefreshToken] ADD CONSTRAINT [RefreshToken_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PasswordResetToken] ADD CONSTRAINT [PasswordResetToken_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StudentGuardian] ADD CONSTRAINT [StudentGuardian_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[Student]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StudentGuardian] ADD CONSTRAINT [StudentGuardian_guardianId_fkey] FOREIGN KEY ([guardianId]) REFERENCES [dbo].[Guardian]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Enrollment] ADD CONSTRAINT [Enrollment_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[Student]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Enrollment] ADD CONSTRAINT [Enrollment_academicYearId_fkey] FOREIGN KEY ([academicYearId]) REFERENCES [dbo].[AcademicYear]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Enrollment] ADD CONSTRAINT [Enrollment_sectionId_fkey] FOREIGN KEY ([sectionId]) REFERENCES [dbo].[Section]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Grade] ADD CONSTRAINT [Grade_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Section] ADD CONSTRAINT [Section_gradeId_fkey] FOREIGN KEY ([gradeId]) REFERENCES [dbo].[Grade]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SectionSubject] ADD CONSTRAINT [SectionSubject_sectionId_fkey] FOREIGN KEY ([sectionId]) REFERENCES [dbo].[Section]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SectionSubject] ADD CONSTRAINT [SectionSubject_subjectId_fkey] FOREIGN KEY ([subjectId]) REFERENCES [dbo].[Subject]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TimetablePeriod] ADD CONSTRAINT [TimetablePeriod_sectionSubjectId_fkey] FOREIGN KEY ([sectionSubjectId]) REFERENCES [dbo].[SectionSubject]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ExamPaper] ADD CONSTRAINT [ExamPaper_examId_fkey] FOREIGN KEY ([examId]) REFERENCES [dbo].[Exam]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Mark] ADD CONSTRAINT [Mark_examPaperId_fkey] FOREIGN KEY ([examPaperId]) REFERENCES [dbo].[ExamPaper]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AttendanceEntry] ADD CONSTRAINT [AttendanceEntry_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[AttendanceSession]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AssignmentSubmission] ADD CONSTRAINT [AssignmentSubmission_assignmentId_fkey] FOREIGN KEY ([assignmentId]) REFERENCES [dbo].[Assignment]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FeeInstallment] ADD CONSTRAINT [FeeInstallment_feePlanId_fkey] FOREIGN KEY ([feePlanId]) REFERENCES [dbo].[FeePlan]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Payslip] ADD CONSTRAINT [Payslip_payrollRunId_fkey] FOREIGN KEY ([payrollRunId]) REFERENCES [dbo].[PayrollRun]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Payslip] ADD CONSTRAINT [Payslip_staffId_fkey] FOREIGN KEY ([staffId]) REFERENCES [dbo].[Staff]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LeaveRequest] ADD CONSTRAINT [LeaveRequest_staffId_fkey] FOREIGN KEY ([staffId]) REFERENCES [dbo].[Staff]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AnnouncementAudience] ADD CONSTRAINT [AnnouncementAudience_announcementId_fkey] FOREIGN KEY ([announcementId]) REFERENCES [dbo].[Announcement]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[BookLoan] ADD CONSTRAINT [BookLoan_bookId_fkey] FOREIGN KEY ([bookId]) REFERENCES [dbo].[Book]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StockMovement] ADD CONSTRAINT [StockMovement_itemId_fkey] FOREIGN KEY ([itemId]) REFERENCES [dbo].[InventoryItem]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TransportRoute] ADD CONSTRAINT [TransportRoute_vehicleId_fkey] FOREIGN KEY ([vehicleId]) REFERENCES [dbo].[Vehicle]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RouteStop] ADD CONSTRAINT [RouteStop_routeId_fkey] FOREIGN KEY ([routeId]) REFERENCES [dbo].[TransportRoute]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TransportAllocation] ADD CONSTRAINT [TransportAllocation_stopId_fkey] FOREIGN KEY ([stopId]) REFERENCES [dbo].[RouteStop]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[HostelAllocation] ADD CONSTRAINT [HostelAllocation_roomId_fkey] FOREIGN KEY ([roomId]) REFERENCES [dbo].[HostelRoom]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[IndentLine] ADD CONSTRAINT [IndentLine_indentId_fkey] FOREIGN KEY ([indentId]) REFERENCES [dbo].[Indent]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[IndentEvent] ADD CONSTRAINT [IndentEvent_indentId_fkey] FOREIGN KEY ([indentId]) REFERENCES [dbo].[Indent]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[QuotationLine] ADD CONSTRAINT [QuotationLine_quotationId_fkey] FOREIGN KEY ([quotationId]) REFERENCES [dbo].[Quotation]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PurchaseOrderLine] ADD CONSTRAINT [PurchaseOrderLine_poId_fkey] FOREIGN KEY ([poId]) REFERENCES [dbo].[PurchaseOrder]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GoodsReceiptLine] ADD CONSTRAINT [GoodsReceiptLine_grnId_fkey] FOREIGN KEY ([grnId]) REFERENCES [dbo].[GoodsReceipt]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[JobApplication] ADD CONSTRAINT [JobApplication_jobOpeningId_fkey] FOREIGN KEY ([jobOpeningId]) REFERENCES [dbo].[JobOpening]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

