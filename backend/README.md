# School ERP — Backend

REST API for the School ERP: **Node.js (20.19+ / 22.12+ / 24) + Express 5 + TypeScript 7**, **Zod 4**, **Prisma 7**,
**Microsoft SQL Server**.

It covers sign-in, organization / branches / academic years, classes, users and roles, students, staff,
academics (timetable, attendance, exams & marks, assignments, notes), fees, expenses, a branch-scoped general ledger,
double-entry manual journal vouchers and financial statements, leave and payroll,
notices and messages, the school website (public pages and forms), front office, library, inventory and
stock analysis, transport, hostel, purchasing (PR → PO → GRN → bill → payment) and the HR suite (staff
attendance, recruitment and offers, onboarding, compensation, statutory payroll, expense claims, training,
exits with full & final). The frontend uses this API for all of its data.

```
backend/
├── DESIGN.md                        full design: tenancy, roles, tables, APIs, security, phases
├── package.json · tsconfig.json · prisma.config.ts · .env.example
├── prisma/schema.prisma             data model (95 tables) — source of truth
├── database/
│   ├── schema.sql                   SQL Server DDL generated from schema.prisma
│   ├── filtered-unique-indexes.sql  "unique when set" columns (Prisma cannot express these)
│   ├── row-level-security.sql       keeps each organization's data separate
│   ├── seed.sql                     plans, permissions, 20 built-in roles, demo DAV org with 3 branches
│   └── migrations/                  changes for databases created earlier (002–025, applied by migrate.ps1)
├── scripts/seed-demo.ts             demo users, teachers, students, parents (+ a 2nd org, Greenfield)
├── scripts/import-frontend-demo.ts  builds a 3rd org, Greenwood, from scripts/demo-data/greenwood.json (dates moved to today)
├── scripts/seed-procurement-demo.ts purchasing demo for Greenwood, created through the API
├── scripts/seed-hr-demo.ts          trainings (slides + test) and an expense claim for Greenwood
├── scripts/test-*.ts                API and database tests (see "Checking the database")
└── src/
    ├── server.ts · app.ts           start-up, activity/auth middleware, route mounting
    ├── config/env.ts                validated environment variables
    ├── db/prisma.ts                 withTenant / withSystem — sets the row-level security context
    ├── auth/                        tokens (JWT + refresh), access (who can do what in which branch)
    ├── middleware/                  authenticate, error handler
    ├── lib/                         errors, audit log, http helpers (forPatch), read scope, payroll (CTC, PF, ESI, PT, TDS)
    └── modules/                     auth · org · classes · users · students · staff · academics · finance · hr ·
                                     communication · website · public · frontoffice · facilities · procurement ·
                                     hrms (workforce, recruitment, training, exit)
```

## 1. Create the database

Needs SQL Server 2019+ (Developer / Express is fine) and an administrator Windows login. In PowerShell:

```powershell
cd backend
powershell -ExecutionPolicy Bypass -File database/setup.ps1 -Database school_erp -AppPassword "<strong password>"
```

This creates the database and runs `schema.sql` → `filtered-unique-indexes.sql` → `row-level-security.sql` →
`constraints.sql` → `procedures.sql` → `seed.sql`, records the migrations as applied, and creates the
API's login **`erp_app`** (read / write data only — it cannot change tables or switch off row-level security).
Put that password in `DATABASE_URL` in `.env`.

**Existing database:** `powershell -ExecutionPolicy Bypass -File database/migrate.ps1` applies any new
`database/migrations/*.sql` (tracked in `dbo.SchemaMigration`) and re-applies constraints and procedures.

The Accounts portal includes a branch-level chart of accounts, balanced and immutable manual journals,
trial balance, income & expenditure, and balance sheet views. New fee receipts/refunds, expenses, vendor
payments, payroll disbursements, grant transactions and positive bank-account opening balances post
source-linked journals. Historical transactions and opening balances are not backfilled, so verify and
reconcile balances before relying on these statements for official reporting.

The Finance Operations screen supports masked bank-account records, duplicate-safe CSV statement imports,
suggested and permission-checked journal matching, financial-year departmental budgets with procurement
commitment checks/hard stops, and restricted grant receipts/spending with utilization CSV exports. Bank
CSV imports accept a header row with date, description and direction/amount or debit/credit columns, up to
500 transactions per file. Statement matching suggests equal-value entries within three days. Automatic
bank postings use the branch's first active account of the matching type (Operating, Hostel, Trust or
Grant); other bank types and MT940 files still need manual reconciliation.

The immutable Audit Log is available in portals to roles granted `audit.read`. It records audited
business changes plus successful authenticated API reads and actions across modules, and supports
action, record type and date filters, branch-aware access, and paginated before/after details. Apply
`022-audit-log-access.sql` and `023-audit-read-actions.sql` to an existing database for built-in
management, finance and audit roles and the additional READ/ACTION event types.

If an Accountant sees a permission error on ledger setup, run the existing-database migration command
above to apply `015-accounting-manager-permissions.sql`. It idempotently grants `accounting.manage` to
the built-in Accountant and Finance Head roles; custom roles must be granted that permission by an
organization administrator.

Fee heads can be itemized into named components (for example tuition: academic, development and activities;
hostel: accommodation and mess), with component totals validated against the annual fee and the full fee
split across configurable dated installments. Late-fee rules and concessions are configurable. Refunds are currently one
full refund per successful payment; transfer/exit settlement and partial refunds are not automatic.
TDS/GST/80G filings, multi-year closing/opening workflows, payroll bank-file exports, direct grant UC PDF,
and accounting-software exports remain outside this phase. Existing statutory payroll calculations and
procurement PO/GRN/vendor-bill matching continue to use their existing modules.

| File | What it holds |
|---|---|
| `schema.sql` | tables, generated from `prisma/schema.prisma` |
| `filtered-unique-indexes.sql` | "unique when set" login and bank-reconciliation columns |
| `row-level-security.sql` | organization isolation for tenant-owned tables, including the ledger |
| `constraints.sql` | 244 foreign keys, 131 checks (allowed values, amounts, dates), 160 indexes — generated by `node scripts/gen-constraints.mjs` |
| `procedures.sql` | `usp_Maintenance`, `usp_StudentDataExport` and `usp_StudentAnonymize` (DPDP requests) |
| `security/app-login.sql` | the least-privilege `erp_app` login |
| `maintenance/` | backups and the weekly clean-up (below) |

### Backups

`powershell -ExecutionPolicy Bypass -File database/maintenance/install-backup-tasks.ps1` schedules, with
Windows Task Scheduler: a full backup every night at 02:00, a log backup every hour, and `usp_Maintenance`
on Sundays. Backups go to `D:SQLBackupsschool_erp` (14 days kept) and are verified after writing.
Run one now with `database/maintenance/backup.ps1 -Type Full`. Restore in SSMS: Databases → Restore Database.
The tasks run while the Windows user is signed in; on a real server use SQL Server Agent.

### Sensitive data

Full Aadhaar, PAN and bank details are encrypted by the API (AES-256-GCM, `src/lib/crypto.ts`) before they
reach the database; only the last 4 Aadhaar digits are stored readable. The key is `DATA_ENCRYPTION_KEY`
in `.env` — **keep a copy somewhere safe**: data encrypted with a lost key cannot be recovered.

### Checking the database

API tests run over HTTP as each role against the `greenwood` demo (after `npm run import:frontend`),
check who may do what, and remove the data they create:

| Command | Checks |
|---|---|
| `npm run test:academics` | timetable, attendance, exams & marks (results only after publishing), assignments, notes — 49 |
| `npm run test:finance` | fee structure, concessions, payments (late fee, receipts, idempotency), expenses, leave, payroll — 42 |
| `npm run test:ledger` | chart and finance-operations permissions, balanced journal vouchers, trial-balance integrity and balance-sheet arithmetic (migrations 013–014) |
| `npm run test:communication` | notices by audience, public notices, messages between students, parents and teachers — 30 |
| `npm run test:website` | public pages and forms, enquiries, visitors, careers, website profile — 35 |
| `npm run test:facilities` | library (fines), inventory (stock), transport (drivers, stops), hostel (rooms, outpasses) — 37 |
| `npm run test:procurement` | the whole purchase flow, PR numbering, store reorders, accounts status of POs — 38 |
| `npm run test:hrms` | CTC & statutory rules, recruitment → offer → joining → onboarding, staff attendance, claims, payroll & payslips, compliance, training tests & MIS, exit with full & final, vendor codes, stock analysis — 77 |
| `npm run test:group` | head-office and region-office roles, who may open the group dashboard, scope per region, totals (after `npm run seed:group`) — 27 |

`npm run test:db` runs 21 checks as the API login: organization isolation (read, insert, update, move),
that the login cannot alter tables or the security policy, foreign keys / checks / unique rules,
encryption, and the data-protection procedures. Nothing is changed.

## 2. Run the API

```bash
cd backend
npm install
cp .env.example .env        # then fill in DATABASE_URL and JWT_SECRET
npx prisma generate
npm run seed:demo           # optional: demo users and students (DAV + Greenfield)
npm run import:frontend     # optional: the demo school "greenwood" (the one the frontend and /school show)
npm run seed:procurement    # optional: purchasing demo for "greenwood" (through the API)
npm run seed:hr             # optional: trainings (slides + tests) and an expense claim for "greenwood"
npm run seed:group          # optional: "greenwood" becomes a 3-school group (2 regions) with head-office sign-ins
npm run dev                 # http://localhost:4000/api/v1
```

`npm run build && npm start` runs the compiled version. `npm run typecheck` checks types.

**After pulling new changes:** `npm install`, then `npx prisma generate` (stop the API first on Windows —
the running server locks Prisma's files), then `powershell -ExecutionPolicy Bypass -File database/migrate.ps1`
to apply new migrations (e.g. `010-hr-suite.sql` for the HR tables).

Use a dedicated SQL login for the API rather than `sa`, with access to `school_erp` only.

### Jarvis (assistant) — `src/modules/assistant/`

`POST /assistant/chat` answers in three ways, cheapest first:
1. **Data conversation, no AI model** (`intent.ts` → `tools.ts`): common questions (a student's fees,
   attendance, marks, contacts, bus; a class's absentees; fee defaulters; staff; leave; timetable; homework;
   exam date sheet; holidays; notices; own salary slip; school contacts; low stock; overdue books; school
   summary; the good-morning briefing) are recognised by keywords, run as read-only tools and answered word
   for word from the data. Each tool checks the caller's permissions like the matching ERP page (staff by
   branch permission, students / parents only their own children; `everyone` tools limit themselves).
   When the class or person is missing Jarvis asks back (`expectsReply: true`) and remembers the open
   question as `ask:<topic>`; when a name matches several people it remembers `pick:<tool>` so “10 B wali”
   chooses; the last topic and person carry over (“aur 10 B ki?”, “uske marks?”); “chhodo” cancels.
   **Actions** (`leave_decision`, `send_notice`, `collect_fee`) only prepare a request — `{ method, path,
   body, summary }` in the reply's `action` — which the panel sends to the normal endpoint (`PATCH /leaves/:id`,
   `POST /announcements`, `POST /fees/payments` with an Idempotency-Key) after the person confirms. The AI
   model is never allowed to pick an action. “yaad rakho …” / “bhool jao” / “kya yaad hai?” use
   `AssistantNote` (migration 027, kept until forgotten; `myClass` defaults to the class-teacher section).
   **Anything else in the ERP** (`erp-read.ts`): a question naming an ERP list — visitors, admission
   enquiries, purchase requests, vendors, GRNs, bills, expenses, bank, budgets, payroll, hostel, transport,
   jobs, interviews, trainings, alumni, audit log, users, roles… (60+ lists) — is answered by calling that
   list's own GET endpoint *with the person's token and branch*, so the API's permissions and row-level
   security decide what comes back. Jarvis never queries or writes the database directly. The reply counts
   and names the rows, filtered by a status word (“pending”) or “aaj”. A request to change something Jarvis
   has no confirm step for (“naya student add karo”, “book issue kar do”) only offers to open the page where
   it is done.
2. **Local AI model** (Ollama) for anything else: answers about the visible page, opens a page from the
   visible menu (checked against the links sent), or picks a data tool.
3. Replies are saved to `AssistantMessage` (migration 026) — the person's memory, read back on each question,
   deleted after `ASSISTANT_MEMORY_MINUTES` (default 10; swept every minute) and capped at 500 per person.
   Chat is rate-limited to 60 questions a minute per signed-in person (not per address — a school shares one).
   `GET /assistant/history`, `DELETE /assistant/history` (clear), `GET /assistant/status` (model check).

The model is self-hosted; nothing goes to OpenAI, Gemini or another hosted AI API. Install Ollama on the
API computer and download the model:

```powershell
ollama pull qwen2.5:7b      # or qwen2.5:1.5b on a laptop without a graphics card (about 4× faster)
```

| Setting (`.env`) | Default | |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | loopback addresses only |
| `OLLAMA_MODEL` | `qwen2.5:7b` | |
| `OLLAMA_TIMEOUT_MS` | `120000` | one model reply |
| `ASSISTANT_PAGE_CHARS` | `3500` | page text sent to the model — the prompt size is what makes CPU replies slow |
| `ASSISTANT_MEMORY_MINUTES` | `10` | how long Jarvis remembers a conversation |

The model runs on the CPU (`num_gpu: 0`): small laptop GPUs run out of memory on a 4k context and are slower
anyway. `npm run test:assistant` checks the data answers, permissions, conversation and memory; it does not
need Ollama.

`DEMO_PAYMENTS=true` lets students and parents "pay" fees online without a payment gateway — for demos only;
the API refuses to start with it in production. Real online payments must come from the gateway's webhook.

## 3. Demo accounts (after `npm run seed:demo`)

Password for all: **`Demo@1234`**. Sign in with `POST /api/v1/auth/login`
`{ "organization": "dav", "username": "...", "password": "Demo@1234" }`.

| Organization | Username | Role |
|---|---|---|
| `dav` | `chairman` · `admin` · `academic.head` | Group Owner · Group Admin · Academic Head (all branches) |
| `dav` | `regional.east` | Regional Manager (Ranchi + Haldia) |
| `dav` | `principal.rnc` · `vp.rnc` · `accountant.rnc` · `reception.rnc` · `branchadmin.rnc` | Ranchi staff (same pattern with `.hld`, `.ptp`) |
| `dav` | `RNC-T001` … `RNC-T006` | Teachers (`HLD-…`, `PTP-…` for the other branches) |
| `dav` | `DAV-RNC/26/0001`, `DAV-RNC/26/0002` | Students (2 per branch) — their fathers can sign in with their phone number |
| `greenfield` | `admin`, `principal.gfa` | A second, separate school — sees none of DAV's data |
| `greenwood` | `admin`, `principal`, `viceprincipal`, `accountant`, `reception`, `exams`, `hr`, `transport`, `warden`, `librarian`, `inventory` | The frontend's demo school, after `npm run import:frontend` |
| `greenwood` | `T001` … `T006` · `ADM-2025-1001` … · `9876511111` | Teachers · students (admission no.) · parents (father's phone) |
| `greenwood` | `chairman` | Management approvals for purchases, after `npm run seed:procurement` |

## 4. Viewing data in SSMS

Row-level security hides every organization's rows unless the session says who you are — even
for `sa`. Run one of these first in the query window:

```sql
EXEC sp_set_session_context N'is_platform_admin', 1;            -- see everything
EXEC sp_set_session_context N'organization_id', '<org id>';   -- see one organization
```

## 5. API overview

Base URL `/api/v1`. Send `Authorization: Bearer <accessToken>`; optionally `X-Branch-Id` to work
in one branch. Errors are always `{ code, message, details? }`.

| | |
|---|---|
| Auth | `POST /auth/login` · `POST /auth/refresh` (cookie) · `POST /auth/logout` · `POST /auth/change-password` |
| Me & organization | `GET /me` · `GET/PUT /org` · `GET/POST /regions` · `GET/POST /branches` · `PATCH /branches/:id` · `GET/POST /academic-years` · `POST /academic-years/:id/make-current` |
| Classes | `GET/POST /grades` · `PATCH/DELETE /grades/:id` · `POST /grades/:id/sections` · `PATCH/DELETE /sections/:id` |
| Students | `GET /students?search=&gradeId=&sectionId=&status=&page=` · `GET /students/full` · `POST /students` · `GET/PATCH /students/:id` · `PUT /students/:id/guardians` |
| Staff | `GET /staff?type=&status=` · `POST /staff` · `PATCH /staff/:id` |
| Academics | `GET/POST /subjects` · `GET /timetable` · `PUT /timetable/sections/:id` · `GET/PUT /attendance` · `GET/POST /exams` · `PATCH/DELETE /exams/:id` · `GET/PUT /marks` · `GET /marks/ranks` · `GET/POST /assignments` · `DELETE /assignments/:id` · `POST /assignments/:id/submissions` · `PATCH /assignments/:id/submissions/:studentId` · `GET/POST /notes` · `DELETE /notes/:id` · `POST /notes/:id/download` |
| Fees & expenses | `GET /fees/structure` · `PUT /fees/structure/:gradeId` · `GET /fees/accounts` · `GET/POST /fees/payments` (Idempotency-Key) · `GET/POST /expenses` · `DELETE /expenses/:id` |
| Leave & payroll | `GET/POST /leaves` · `PATCH /leaves/:id` · `GET /payroll` · `POST /payroll/:month/{process,pay}` · `GET /payroll/:month/compliance` · `GET /payslips/:id` · `GET /me/payslips` |
| HR operations | `GET/PUT /hr/settings` · `POST /hr/ctc/preview` · `GET/PUT /staff/:id/compensation` · `PATCH /staff/:id/bgv` · `GET /onboarding` · `POST /staff/:id/onboarding` · `PATCH /onboarding/:taskId` · `GET/PUT /staff-attendance` · `GET /me/attendance` · `GET /leave-balances` · `GET/POST /expense-claims` · `PATCH /expense-claims/:id` (`?mine=1` on lists = only your own) |
| Recruitment | `POST /job-applications` · `GET /interviews` · `POST /job-applications/:id/interviews` · `PATCH /interviews/:id` · `GET /offers` · `POST /job-applications/:id/offer` · `PATCH /offers/:id` · `POST /offers/:id/join` |
| Training | `GET/POST /trainings` · `GET/PATCH /trainings/:id` · `PUT /trainings/:id/questions` · `POST /trainings/:id/{enroll,attendance,test,feedback}` · `DELETE /trainings/:id/enroll/:staffId` · `GET /trainings-mis` |
| Exit | `GET/POST /separations` · `PATCH /separations/:id` · `PUT /separations/:id/{exit-interview,handover}` · `POST /separations/:id/{fnf,settle}` · `GET /separations/:id/documents` |
| Communication | `GET/POST /announcements` · `DELETE /announcements/:id` · `GET/POST /messages` (`?scope=school` for principals) · `POST /messages/:id/read` |
| Website & front office | `GET/PUT /website` · `GET /website/messages` · `PATCH /website/messages/:id` · `GET /website/alumni` · `GET/POST /jobs` · `PATCH /jobs/:id` · `GET /job-applications` · `PATCH /job-applications/:id` · `GET/POST /enquiries` · `PATCH /enquiries/:id` · `GET/POST /visitors` · `POST /visitors/:id/checkout` |
| Public (no sign-in) | `GET /public/:school/{site,announcements,exams,fees,faculty,jobs}` · `POST /public/:school/{enquiries,applications,contact,alumni}` · `POST /public/demo-requests` (forms are rate-limited) |
| Facilities | `GET /library` · `POST /library/books` · `PATCH/DELETE /library/books/:id` · `PUT /library/books/:id/pdf` · `GET /library/digital-books?studentId=` · `GET /library/digital-books/:id/pdf?studentId=` · `POST /library/loans` · `POST /library/loans/:id/return` · `POST /library/digital-loans` · `POST /library/digital-loans/:id/return` · `GET/POST /inventory/items` · `PATCH/DELETE /inventory/items/:id` · `POST /inventory/items/:id/movements` · `GET /inventory/movements` · `GET /inventory/analysis?months=` · `GET/PUT /inventory/settings` · `GET /transport` · `POST/PATCH/DELETE /transport/{vehicles,routes}` · `GET /hostel` · `POST /hostel/allocations` · `POST /hostel/residents/:studentId/vacate` · `POST /hostel/outpasses` · `PATCH /hostel/outpasses/:id` |

Library PDFs are uploaded as `application/pdf` binary requests (maximum 20 MB) and stored with the book record. Digital PDF access is issued and returned separately from hard copies, so digital issues do not consume physical stock. Student/guardian catalogue and reader requests are scoped to a linked student; the PDF endpoint additionally requires an active digital issue. Returning a digital issue revokes reader access.
| Procurement | `GET/POST /procurement/indents` · `POST /procurement/indents/:id/{hod,store-check,principal,management,cancel,issue}` · `GET/POST /procurement/indents/:id/quotations` · `GET /procurement/quotations` · `DELETE /procurement/quotations/:id` · `POST /procurement/indents/:id/purchase-order` · `GET /procurement/purchase-orders` · `POST /procurement/purchase-orders/:id/{receipts,cancel}` · `GET /procurement/receipts` · `GET/POST/PUT /procurement/vendors` · `GET/PUT /procurement/settings` |
| Payables | `GET/POST /payables/bills` · `POST /payables/bills/:id/{decision,pay}` · `GET /payables/payments` · `GET /petty-cash` · `POST /petty-cash/{spend,top-up}` |
| Group office | `GET /group/overview` (schools in scope side by side, group and region totals; needs `group.view`) |
| Users & roles | `GET/POST /users` · `GET/PATCH /users/:id` · `POST /users/:id/reset-password` · `POST/DELETE /users/:id/memberships` · `GET/POST /roles` · `PUT /roles/:id/permissions` · `GET /permissions` |

### How access works

- **Organization** comes from the sign-in token; SQL Server row-level security makes every query
  see only that organization's rows (`withTenant` in `src/db/prisma.ts`).
- **Branch and permission** come from the user's memberships: a role held at organization level
  applies to every branch, at region level to that region's branches, at branch level to one branch.
- Students and parents see only their own / their child's records: marks only once results are published,
  their own attendance entries and submissions, notices addressed to them, and their class rank (not classmates' marks).
- Users with `users.manage` can only grant roles inside their own scope (a branch admin cannot create a group admin).
- Access tokens last 15 minutes; refresh tokens (http-only cookie) rotate on every use, and reusing an old
  one signs the user out everywhere. Disabling a user takes effect on their next request.
- Admissions, edits, role changes and sign-ins are written to `AuditLog`.

## Changing the schema

Edit `prisma/schema.prisma`, then regenerate the SQL so both stay in sync:

```bash
npx prisma validate
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > database/schema.sql
```

Then write the change as `database/migrations/NNN-name.sql` (`npx prisma migrate diff --from-schema <old> --to-schema prisma/schema.prisma --script`),
run `node scripts/gen-constraints.mjs` and `database/migrate.ps1`.

Prisma 7: the connection URL is no longer in `schema.prisma` — the CLI reads `DATABASE_URL` through
`prisma.config.ts`, and the API connects with the SQL Server driver adapter (`@prisma/adapter-mssql`) in
`src/db/prisma.ts`. Every new table with an `organizationId`
column must be added to `database/row-level-security.sql` and, for existing databases, in the migration.
An optional column that must be unique when set goes in `database/filtered-unique-indexes.sql`
(not `@unique`: SQL Server allows only one NULL in a unique constraint).
