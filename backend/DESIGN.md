# School ERP — Backend Design (draft v1)

Turns the current browser-only demo into a subscription product (SaaS) that many schools and
school chains (e.g. DAV Ranchi, DAV Delhi, … under one DAV organization) can use at the same time,
each seeing only its own data.

| | |
|---|---|
| Database | **Microsoft SQL Server** (Azure SQL in production, SQL Server Express / Docker for development) |
| API | Node.js + TypeScript + **Express**, REST + JSON (Phase 1 built — see README.md) |
| ORM | Prisma (`provider = "sqlserver"`) |
| Files | Azure Blob Storage (or S3) — the database stores only metadata |
| Payments | Razorpay (school fees and our own subscriptions) |
| Messaging | SMS / WhatsApp provider (e.g. MSG91, Gupshup), email (SES / SendGrid) |

Files in this folder (`backend/`):

- [`prisma/schema.prisma`](prisma/schema.prisma) — the data model (58 tables). Validated with `prisma validate`.
- [`database/schema.sql`](database/schema.sql) — the same model as SQL Server DDL, generated from the Prisma schema. Can be run in SSMS.
- [`database/row-level-security.sql`](database/row-level-security.sql) — tenant isolation policy for 55 tables. Run after `schema.sql`.

---

## 1. Tenancy: organizations, regions, branches

```
Platform (us)
 └── Organization        e.g. DAV College Managing Committee   ← the paying customer
      ├── Region (optional)   e.g. Jharkhand, Delhi NCR
      │    └── Branch          e.g. DAV Ranchi, DAV Haldia      ← one campus / school
      └── Branch               (single-school customers have one branch, no regions)
```

- A single school is just an organization with one branch — the same model serves both.
- **Every tenant table has `organizationId`**; campus data also has **`branchId`**.
- One shared database and schema for all customers (simplest to run and update).
  Very large customers can later be moved to their own database without code changes.

### How data stays separate — three layers

| Layer | What it does |
|---|---|
| 1. SQL Server Row-Level Security | The database itself filters every query by `SESSION_CONTEXT('organization_id')`. A bug that forgets a `WHERE` still cannot leak another customer's data. See `database/row-level-security.sql`. |
| 2. API scope middleware | Works out which branches the user may touch (from their memberships) and adds `branchId` filters. A DAV Ranchi principal cannot read DAV Delhi. |
| 3. Permission checks | Each endpoint requires a permission (`fees.collect`, `marks.write`, …). |

Request flow:

```
JWT → load user + memberships → set SESSION_CONTEXT(organization_id) on the connection
    → resolve allowed branches (header X-Branch-Id must be one of them)
    → check permission → run query inside a transaction → write AuditLog for changes
```

> Prisma uses a connection pool, so the session context is set **inside each transaction**
> (`$transaction([ $executeRaw\`EXEC sp_set_session_context …\`, …query ])`) to make sure the
> query runs on the same connection.

---

## 2. Users, roles and permissions

- `User` = anyone who signs in (staff, student, parent, group official). Usernames are unique per organization.
- `Role` = a named set of `Permission`s. Built-in roles are shared (`organizationId = NULL`);
  an organization can create **custom roles** (e.g. "Auditor", "Admissions Head").
- `Membership` = a user holds a role **at a scope**: the whole organization, one region, or one branch.
  One person can have several (a teacher at two campuses; a principal who is also a regional head).

### Built-in roles

| Level | Roles |
|---|---|
| Organization | Group Owner / Chairman (view all), Group Admin (users, branches, settings), Academic Head, Finance Head, HR Head |
| Region | Regional Manager |
| Branch | Principal, Vice Principal, Teacher, Accountant, Receptionist, Exam Controller, HR, Transport Manager, Hostel Warden, Librarian, Inventory Manager, Branch Admin |
| Self | Student, Parent |

Class teacher and HOD are **not roles**: a teacher is class teacher through `Section.classTeacherId`,
and HOD through a staff position. They get the extra pages automatically.

### Permissions (examples)

`students.read · students.write · students.transfer · attendance.write · marks.write · exams.publish ·
fees.collect · fees.structure · expenses.write · payroll.run · leave.approve · library.issue ·
inventory.write · transport.write · hostel.write · enquiries.write · announcements.send ·
users.manage · settings.manage · reports.view`

The current frontend's role list maps 1:1 to the branch / self roles above, so the UI menus stay as they are.

---

## 3. Data model (summary)

Full definitions are in `prisma/schema.prisma`. Key design decisions:

| Area | Tables | Notes |
|---|---|---|
| Platform | Plan, Subscription, SubscriptionInvoice | Our billing. Price per branch per month. |
| Structure | Organization, Region, Branch, AcademicYear | Settings are JSON on the organization; a branch can override. |
| Access | User, Role, Permission, RolePermission, Membership, RefreshToken | See §2. |
| People | Staff, Student, Guardian, StudentGuardian, **Enrollment** | **A student's class lives in `Enrollment` per academic year**, so promotion keeps history (today the demo stores only the current class). One parent account links to all their children, even in different branches. |
| Academics | Grade, Section, Subject, SectionSubject, TimetablePeriod | `SectionSubject` = who teaches what in which section (replaces hard-coded timetable names). |
| Exams | Exam, ExamPaper, Mark | `Exam.branchId = NULL` means a common exam for every branch. Students see marks only when `resultsPublished`. |
| Attendance | AttendanceSession, AttendanceEntry | One register per section per day (or per period). |
| Coursework | Assignment, AssignmentSubmission, StudyNote, Attachment | Files go to blob storage. |
| Fees | FeePlan, FeeInstallment, FeeConcession, FeePayment | Plan per grade per branch per year; fee heads (tuition, transport, hostel…). Payments are idempotent (no double charge on retry). |
| Accounts / HR | Expense, PayrollRun, Payslip, LeaveRequest | Salary details live on `Staff`. |
| Communication | Announcement, AnnouncementAudience, Message, Notification | `Notification` is the outbox for SMS / WhatsApp / email. |
| Facilities | Book, BookLoan, InventoryItem, StockMovement, Vehicle, TransportRoute, RouteStop, TransportAllocation, HostelRoom, HostelAllocation, Outpass | |
| Front office | Enquiry, Visitor | |
| Audit | AuditLog | Who changed fees, marks, student records — and when. |

SQL Server specifics: ids are `UNIQUEIDENTIFIER`; status fields are `NVARCHAR` with the allowed values
noted in the schema (Prisma has no enums on SQL Server); JSON is `NVARCHAR(MAX)` (query with `JSON_VALUE`);
money is `DECIMAL(12,2)`; relations never cascade deletes — records are deactivated instead.

---

## 4. API

REST under `/api/v1`. The active branch is sent as `X-Branch-Id`; organization comes from the login.
Lists support `?page=&pageSize=&search=&sort=`. Errors use a single JSON shape `{ code, message, details }`.

| Module | Endpoints (main) |
|---|---|
| Auth | `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `POST /auth/forgot-password` · `GET /me` (user, memberships, permissions) |
| Organization | `GET/PUT /org` · `GET/POST /branches` · `GET/POST /regions` · `GET/POST /academic-years` |
| Users & roles | `GET/POST /users` · `PATCH /users/:id` (enable/disable) · `GET/POST /roles` · `PUT /roles/:id/permissions` · `POST /users/:id/memberships` |
| Students | `GET/POST /students` · `GET/PUT /students/:id` · `POST /students/:id/transfer` · `POST /enrollments/promote` · `GET/POST /guardians` |
| Staff | `GET/POST /staff` · `GET/PUT /staff/:id` · `POST /staff/:id/transfer` |
| Classes | `GET/POST /grades` · `GET/POST /sections` · `GET/POST /subjects` · `PUT /sections/:id/subjects` · `GET/PUT /timetable` |
| Attendance | `GET /attendance?sectionId&date` · `PUT /attendance` (bulk) · `GET /attendance/summary?studentId` |
| Exams & marks | `GET/POST /exams` · `POST /exams/:id/publish` · `GET/PUT /marks?examPaperId` (bulk) · `GET /results/:studentId` · `GET /exams/:id/admit-cards` |
| Coursework | `GET/POST /assignments` · `POST /assignments/:id/submissions` · `PUT /submissions/:id/grade` · `GET/POST /notes` · `POST /files` (upload URL) |
| Fees | `GET/PUT /fee-plans` · `GET /students/:id/fee-account` · `POST /payments/order` (Razorpay) · `POST /payments/webhook` · `POST /payments/counter` (cash) · `GET /receipts/:id.pdf` |
| Accounts & HR | `GET/POST /expenses` · `POST /payroll/:month/process` · `POST /payroll/:month/pay` · `GET/POST /leave` · `POST /leave/:id/decide` |
| Communication | `GET/POST /announcements` · `GET/POST /messages` · `POST /messages/:id/read` |
| Facilities | `/books` · `/loans` · `/inventory/items` · `/inventory/movements` · `/vehicles` · `/routes` · `/transport/allocations` · `/hostel/rooms` · `/hostel/allocations` · `/outpasses` |
| Front office | `GET/POST /enquiries` · `PATCH /enquiries/:id` · `GET/POST /visitors` · `POST /visitors/:id/checkout` |
| Group (multi-branch) | `GET /group/dashboard` · `GET /group/compare?metric=fees|attendance|results` · `GET /group/reports/:type` |
| Platform (us) | `POST /platform/organizations` · `PATCH /platform/organizations/:id` (plan, suspend) · `GET /platform/billing` |

---

## 5. Moving the current frontend to the API

All pages already read data through hooks in `frontend/src/store/`, so pages do not change — only the stores do.

| Frontend store | Replaced by |
|---|---|
| `session.ts` | `/auth/*`, `/me` (token in memory + refresh cookie) |
| `students.ts`, `classes.ts` | `/students`, `/enrollments`, `/grades`, `/sections` |
| `teachers.ts`, `hr.ts` | `/staff`, `/leave`, `/payroll` |
| `marks.ts`, `exams.ts` | `/exams`, `/marks`, `/results` |
| `attendance.ts` | `/attendance` |
| `assignments.ts`, `notes.ts` | `/assignments`, `/notes`, `/files` |
| `fees.ts`, `finance.ts` | `/fee-plans`, `/fee-account`, `/payments`, `/expenses` |
| `communication.ts` | `/announcements`, `/messages` |
| `library.ts`, `inventory.ts`, `transport.ts`, `hostel.ts`, `frontOffice.ts` | their modules |

Plan: replace `createCollectionStore` with a small data-fetching layer (TanStack Query or RTK Query)
that keeps the same hook names (`useStudents()`, `useMarks()`, …). One module at a time; Students first.

New UI needed: branch switcher in the top bar, Group Admin portal (branch comparison), organization
settings, and a platform admin console for us.

---

## 6. Security & compliance

- Passwords hashed with bcrypt (12 rounds); short-lived access token (15 min) + rotating refresh token (reuse of an old one revokes all of the user's sessions).
- Rate-limit login; lock after repeated failures; optional OTP login for parents.
- Aadhaar, bank details and documents encrypted in the application before storing (`sensitive` columns);
  only the last 4 digits of Aadhaar are stored in clear.
- Every change to fees, marks, attendance and student records is written to `AuditLog`.
- **DPDP Act 2023**: parental consent for children's data, privacy notice, data export and deletion on request,
  data stored in India (Azure Central India region).
- Backups: Azure SQL automated backups (point-in-time restore, 7–35 days) + weekly long-term backup.

---

## 7. Phases

| Phase | Work | Estimate (1 developer) |
|---|---|---|
| 1 | API skeleton, auth, organizations/branches, users/roles, RLS, Students module end-to-end | 3–4 weeks |
| 2 | Classes, staff, attendance, exams & marks, assignments & notes | 4–5 weeks |
| 3 | Fees with Razorpay, receipts, expenses, payroll, leave | 3–4 weeks |
| 4 | Communication + SMS/WhatsApp, library, inventory, transport, hostel, front office | 3–4 weeks |
| 5 | Multi-branch: branch switcher, Group Admin dashboards, transfers; platform admin & subscriptions | 2–3 weeks |
| 6 | Hosting, monitoring, backups, security review, pilot with 1–2 schools | 2–4 weeks |

---

## 8. Open decisions

1. ~~API language~~ — decided: Node.js + TypeScript + Express.
2. **Hosting** — Azure (natural fit for SQL Server; India regions) or AWS RDS for SQL Server.
3. **SQL Server edition / licence** — Azure SQL Database (pay per use, no licence to buy) is recommended over a self-hosted SQL Server licence.
4. **Pricing model** — per branch per month, or per student per year.
5. **Login for parents** — password or phone OTP (OTP needs an SMS budget).
