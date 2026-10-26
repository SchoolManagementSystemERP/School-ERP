# School ERP

School management software for single schools and school chains (many branches under one
organization). Every role has its own portal — admin, principal, vice principal, teachers, students,
parents, accounts, HR, front office, exams, transport, hostel, library and inventory — plus a public
website for each school. All data lives in Microsoft SQL Server behind a REST API.

```
School ERP/
├── frontend/   React 19 + Vite 8 + Tailwind CSS 4 + shadcn/ui — every portal and the websites
├── backend/    REST API (Node.js + Express 5 + Prisma 7) and the SQL Server database scripts
├── TODO.md     what is done and what is left
└── README.md
```

Quick links: [frontend/README.md](frontend/README.md) (pages, demo logins, project structure) ·
[backend/README.md](backend/README.md) (database setup, API, tests) · [backend/DESIGN.md](backend/DESIGN.md)
(tenancy, roles, tables, security) · [TODO.md](TODO.md).

---

## 1. Introduction

### 1.1 Project overview

School ERP is a web application that runs the day-to-day work of a school: admissions, classes and
timetables, attendance, exams and results, homework, fees, staff and payroll, purchasing and stock, library,
transport, hostel, communication and the school website. Administrators, principals, teachers, office staff,
students and parents each sign in to a portal that shows only what their role may see.

### 1.2 Objectives

- Automate school processes and remove paperwork and manual errors.
- Give every stakeholder real-time access to the data they need.
- Keep each school's data private, even when many schools share one installation.
- Produce reports and analytics for decisions.

### 1.3 Scope

Multi-school (multi-tenant) with branches, role- and branch-based access control, and Indian school
practice built in: CBSE-style classes and grading, INR fees with receipts, PF / ESI / professional tax /
TDS in payroll, GST and TDS on vendor bills, and DPDP data-protection requests.

---

## 2. System architecture

### 2.1 Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript 7, Vite 8, Tailwind CSS 4, shadcn/ui (Radix UI), React Router 8, Recharts 3, lucide icons |
| Backend | Node.js (20.19+ / 22.12+ / 24), Express 5, TypeScript 7, Zod 4 validation |
| Database | Microsoft SQL Server 2019+, Prisma 7 with the SQL Server driver adapter (`@prisma/adapter-mssql`) |
| Authentication | JWT access tokens + rotating refresh token in an HTTP-only cookie, bcrypt password hashing, rate-limited sign-in |
| Data isolation | SQL Server row-level security: every query runs with the organization in the session context |

### 2.2 How the pieces fit

- The frontend never talks to the database. It calls the API (`/api/v1`); in development Vite forwards
  `/api` to `http://localhost:4000`, so the app and the API share one origin.
- The API checks every request against the person's role and branch, then reads or writes through
  `withTenant`, which sets the organization for SQL Server's row-level security.
- Aadhaar, PAN and bank details are encrypted by the API (AES-256-GCM) before they reach the database.

---

## 3. User roles and portals

Sign in at `/login` with the school code, a username and a password. Demo logins for every role are in
[frontend/README.md](frontend/README.md#demo-logins) (school code `greenwood`, password `Demo@1234`).

| Role | Portal | Main work |
|---|---|---|
| Group office (chairman, director, secretary, treasurer, trustees, group heads, regional / cluster heads) | `/group` | **Group Dashboard**: every school in their scope side by side; purchase approvals above the principal's limit |
| Admin / IT head | `/admin` | Login accounts, roles & permissions, system and website settings, Group Dashboard |
| Principal | `/principal` | All academics, finance, inventory, library, school setup, purchase approvals, expense-claim approvals |
| Vice principal | `/vice-principal` | Academics and people, without finance and setup |
| Teacher | `/teacher` | Attendance, marks, homework, notes, timetable, students, messages, leave, requisitions, My Class |
| Student | `/student` | Today's classes, homework, results, attendance, fees, admit card, notes, messages |
| Parent | `/parent` | The child's student pages (switch between siblings), fee payment |
| Accountant | `/accountant` | Fee collection and structure, expenses, payroll, statutory compliance, vendor bills and payments, petty cash |
| HR manager | `/hr` | The full HR suite (section 4.10) |
| Receptionist | `/reception` | Admission enquiries, visitors, new admissions |
| Exam controller | `/exams` | Exam schedule, admit cards, results |
| Inventory manager | `/inventory` | Stock, stock analysis and the purchase flow (section 4.12) |
| Librarian · Transport manager · Hostel warden | `/librarian` · `/transport` · `/hostel` | Library, transport, hostel |

Every staff portal also has **My HR** (section 4.11).

**Above the school.** An organization (school group / trust) has a head office and, optionally, regions
(zones or clusters). Built-in head-office roles: Chairman (Group Owner), CEO / Director, Secretary / Manager,
Treasurer, Trustee, Group Admin, IT Head, Academic Head, Finance Head, HR Head, Admissions Head, Purchase Head,
Compliance / Legal Officer, Internal Auditor, Quality / Inspection Officer, Transport Head, Marketing / PR Head,
Training Coordinator. A region office: Regional Manager, Assistant Regional Director, Cluster / Area Coordinator,
Regional Academic Coordinator, Subject Coordinator, Regional Exam Coordinator, Regional Inspector, Regional
Training Coordinator, Special Education / Counselling Coordinator, Regional Accounts Officer, Regional Auditor,
Regional HR Officer, Regional Admissions Coordinator, Regional Purchase / Store Officer, Regional Transport
Coordinator, Regional Infrastructure / Maintenance Officer, Regional IT Coordinator, Sports & Co-curricular
Coordinator, Regional PR / Marketing and Regional Office Staff — they see only their region's schools. The admin
can add more roles; a custom organization- or region-wide role opens the Group office.

---

## 4. Functional modules

### 4.1 Authentication
Sign-in with school code + username + password; the session survives page reloads (refresh cookie);
forced password change on first sign-in; password reset by the admin; repeated failed attempts are
slowed down (rate limits per account and per address); disabled accounts and leavers cannot sign in.

### 4.2 Organization and school setup
Organizations with regions and branches, academic years (one current), classes and sections, subjects,
grading scales.

### 4.3 Students
Admission, profile (with guardians, address, health, previous school), roll numbers, section changes,
transfer, sign-ins for students and parents; DPDP data export and anonymization.

### 4.4 Academics
- **Timetable:** per section, with clash checks for teachers.
- **Attendance:** period-wise, by the teacher of that period; monthly reports.
- **Exams and results:** exam schedule with papers, marks entry, grades, class ranks; results are visible to
  students and parents only after the principal publishes them; admit cards.
- **Homework and notes:** assignments with submissions and grading; study notes with downloads.

### 4.5 Student and parent portal (mobile friendly)
A phone-style tab bar at the bottom, a home page with today's classes (with *Now* / *Next*), a "needs
attention" list (homework due, fees due, upcoming exams, unread messages), a day-by-day timetable, and a
fees page with the next payment, instalments, receipts and payment history.

### 4.6 Fees and finance
Fee structure per class, concessions, instalments, late fees, payments with receipts (safe against double
submission), dues; expenses; online "pay now" for parents (demo mode until a payment gateway is connected).

### 4.7 Communication
Notices by audience (whole school, classes, staff), public notices on the website, messages between
students, parents and teachers.

### 4.8 School website and front office
A public website per school (home, about, academics, admissions, facilities, gallery, faculty, notices,
CBSE disclosure, careers, alumni, contact). Its forms feed the ERP: admission enquiries → Reception, job
applications → HR, contact and grievance messages → Admin. Reception also keeps the visitor log.

### 4.9 Library, transport and hostel
Books, issue / return, fines; vehicles, routes, stops and drivers; rooms, residents and outpasses.

### 4.10 Human resources (HR portal)
| Area | What is built |
|---|---|
| Recruitment | Job openings on the website; candidates from the website or added by HR (referral, walk-in, job portal…); screening score and notes; interview rounds with ratings and feedback |
| Offers | Offer letter with the CTC annexure (printable A4); sent → accepted / declined / withdrawn; "Joined" creates the employee with the next employee code, an ERP sign-in and payroll enrolment |
| Onboarding | Joining checklist (documents, background verification, ID card, PF / ESI, induction) per new employee |
| Staff attendance | Daily register (present, absent, half day, leave, holiday, week off, in / out time) and a month view; unapproved absence becomes loss of pay |
| Leave | Leave requests and approval; yearly balances by type (casual, sick, earned…) |
| Compensation | CTC calculator (basic, HRA, special allowance, employer PF, gratuity, take-home) and each employee's salary structure |
| Payroll | Monthly run from salary structures with loss of pay, approved expense claims, PF, ESI, professional tax and TDS (new tax regime); payslips to view and print |
| Statutory compliance | PF, ESI, professional tax and TDS per month, with due dates and CSV export |
| Expense claims | Staff claim, principal / HR approve or reject, approved claims are paid with the next salary |
| Training (L&D) | Training calendar, presentation slides, question bank, trainer and participants, attendance, pre- and post-tests scored by the server, feedback, MIS report |
| Exits | Resignation or separation, acceptance, exit interview, handover checklist, full & final settlement (salary, leave encashment, bonus, gratuity, claims, notice recovery) sent to Accounts; resignation, acceptance, experience and relieving letters |
| HR settings | Salary structure and statutory rules (PF, ESI, PT slabs, leave policy, notice period, bonus) |

### 4.11 My HR (every staff member)
Payslips, own attendance calendar and leave balance, expense claims, enrolled trainings (slides and tests)
and resignation with exit interview and letters.

### 4.12 Inventory and purchasing (Inventory portal)
| Page | What it does |
|---|---|
| Dashboard | Stock value, items below minimum, open purchase orders, dead stock; stock in vs out chart; value by category; top vendors; the purchase pipeline; what needs action today |
| All items · Categories · Reports | Items, stock in / out, minimum levels, categories, reports |
| Stock analysis | ABC classes (by consumption value), fast / slow / non-moving items, monthly consumption, days of stock cover and reorder quantities |
| Purchase requisitions (PR) | Every request to buy (`PR/26-27/0001`), from teachers or the store itself ("Reorder low stock"); store check, approval, quotations compared side by side, purchase order |
| Purchase orders | Orders with delivery progress, overdue alerts, printable PO, cancel |
| Goods receipts (GRN) | What arrived and what passed the quality check (stock updated), printable GRN, and each GRN's status in Accounts: bill awaited → billed → paid |
| Vendor master | Vendor codes (`V-0001`…), GSTIN, PAN, bank and TDS details, and each vendor's orders, spend, on-time delivery and rejection rate |

The approval rules: the HOD approves first, the principal up to a limit, management above it; purchases
above a threshold need three quotations (or a written reason). Accounts enters the vendor's bill, which must
match the PO and the GRN (three-way match), and pays it with TDS deducted.

### 4.13 Group dashboard (head office)
Every school in the person's scope side by side — students and staff, fees collected / overdue and the
collection rate, attendance (last 30 days), average result of published exams, spending and payroll, open
admission enquiries, purchase requests and low stock — with group and region totals, below-target values
flagged, charts, a detail panel per school and CSV export. A regional or cluster head sees only their region.
Only totals are shown, never personal records.

### 4.14 Users, roles and audit
Login accounts, 52 built-in roles with editable permissions, branch-level access, and an audit log of changes.

### 4.15 Reports and dashboards
Dashboards for every role (attendance, results, fee collection, staff, stock, purchasing), CSV exports and
printable documents (receipts, admit cards, payslips, offer letters, POs, GRNs, exit letters).

---

## 5. Database design

Microsoft SQL Server, modelled in `backend/prisma/schema.prisma` (92 tables). The main groups:

| Group | Tables (examples) |
|---|---|
| Organization | Organization, Region, Branch, AcademicYear, Plan, Subscription |
| People and access | User, Role, Permission, Membership, RefreshToken, AuditLog |
| Students | Student, Guardian, Enrollment |
| Academics | Grade, Section, Subject, TimetablePeriod, AttendanceSession, AttendanceEntry, Exam, ExamPaper, Mark, Assignment, StudyNote, Holiday |
| Fees and finance | FeePlan, FeeInstallment, FeeConcession, FeePayment, Expense |
| HR | Staff, LeaveRequest, PayrollRun, Payslip, StaffAttendance, ExpenseClaim, InterviewRound, JobOffer, OnboardingTask, Training, TrainingQuestion, TrainingEnrollment, Separation |
| Purchasing | Indent (PR), Quotation, PurchaseOrder, GoodsReceipt, Vendor, VendorBill, VendorPayment, PettyCashVoucher |
| Facilities | InventoryItem, StockMovement, Book, BookLoan, Vehicle, TransportRoute, RouteStop, HostelRoom, Outpass |
| Website and front office | JobOpening, JobApplication, Enquiry, Visitor (the website profile is part of the organization's settings) |

Ids are GUIDs; money is DECIMAL(12,2) in rupees. Foreign keys, check constraints and indexes are in
`backend/database/constraints.sql`; changes to existing databases are versioned migrations
(`backend/database/migrations/002–012`).

---

## 6. Multi-tenant architecture

One installation serves many schools (organizations), each with its own branches. Every tenant table
carries `organizationId`, and SQL Server row-level security (86 tables) hides other organizations' rows
from every query — even a bug in the API cannot read another school's data. The API's database login can
read and write data but cannot change tables or switch the security policy off. Each school's public
website is meant to run on its own subdomain.

---

## 7. Security features

- JWT access tokens, rotating refresh tokens (HTTP-only cookie), bcrypt password hashing.
- Rate-limited sign-in (per account and per address) and form submissions.
- Role- and branch-based permissions checked on every request.
- Row-level security per organization in the database; least-privilege database login.
- Aadhaar, PAN and bank details encrypted (AES-256-GCM); only the last four Aadhaar digits readable.
- Audit log of changes; nightly full and hourly log backups (verified); DPDP export and anonymize procedures.
- Helmet security headers; input validation on every endpoint.

---

## 8. Running the project

Needs Node.js 20.19+ (or 22.12+ / 24) and SQL Server 2019+.

```bash
# 1. database and API — see backend/README.md for creating the database
cd backend
npm install
npx prisma generate
npm run import:frontend     # demo school "greenwood"
npm run seed:procurement    # optional: purchasing demo
npm run seed:hr             # optional: trainings and an expense claim
npm run seed:group          # optional: makes "greenwood" a 3-school group with head-office sign-ins
npm run dev                 # API on http://localhost:4000/api/v1

# 2. frontend, in a second terminal
cd frontend
npm install
npm run dev                 # app on http://localhost:5173
```

Sign in with school code `greenwood`, password `Demo@1234` and a username from
[frontend/README.md](frontend/README.md#demo-logins).

**After pulling new changes:** run `npm install` in both folders, `npx prisma generate` in `backend`
(stop the API first on Windows), and `powershell -File database/migrate.ps1` in `backend` to apply new
database migrations.

**On a phone (same Wi-Fi / hotspot):** start the frontend with `npx vite --host 0.0.0.0`, find the
computer's address with `ipconfig` (IPv4), and open `http://<that address>:5173` on the phone. Allow
Node.js through Windows Firewall on private networks if the page does not open.

**Tests:** `cd backend` and run `npm run test:db`, `test:academics`, `test:finance`, `test:communication`,
`test:website`, `test:facilities`, `test:procurement`, `test:hrms`, `test:group` — 366 checks over HTTP as each role.

---

## 9. Future enhancements

See [TODO.md](TODO.md). The main ones: online fee payments through a payment gateway, file storage for
uploads, SMS / WhatsApp / email notifications, hosting on Azure with one subdomain per school, an online
examination system, mobile apps, biometric attendance and an LMS.

---

## 10. Conclusion

School ERP covers the academic, administrative, HR, financial and purchasing work of a school in one
system, keeps each school's data separate and protected, and gives every role a portal built around its
daily work.
