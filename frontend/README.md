# School ERP — Frontend

A role-based school management frontend built with React 19, TypeScript 7, Vite 8, Tailwind CSS 4,
shadcn/ui (Radix UI), React Router 8 and Recharts 3. Needs Node.js 20.19+ (or 22.12+ / 24).
Original design: [Figma](https://www.figma.com/design/H9ug8019RQgKu4Uu3YzEA6/School-ERP-Teacher-Dashboard).

## Getting started

```bash
npm install
npm run dev        # start dev server
npm run build      # production build
npm run preview    # preview the production build
npm run typecheck  # TypeScript type check
```

The frontend needs the API: start it first (`cd ../backend && npm run dev`, see `backend/README.md`).
Vite forwards `/api` to `http://localhost:4000` (set `VITE_API_TARGET` to use another address).
The public school website shows the school named by `VITE_SITE_ORG` (default: the last school signed in to,
else `greenwood`); in production each school's site runs on its own subdomain.

To open the app on a phone on the same Wi-Fi / hotspot, start it with `npx vite --host 0.0.0.0` and open
`http://<computer's IPv4 address>:5173` (find the address with `ipconfig`).

### Pages

| URL | What it is |
|---|---|
| `/` | SchoolERP product website (features, roles, pricing, FAQ, demo booking) — plus `/privacy` and `/terms` |
| `/school` | Sample school website: home, about, academics, admissions, facilities, student life, gallery, faculty, notices, CBSE disclosure, careers, alumni, contact |
| `/login` | Sign in to the ERP portals |

The school website is connected to the ERP: admission enquiries go to Reception → Enquiries, job
applications to HR → Recruitment, contact / grievance messages and alumni sign-ups to Admin → School
Website (where the admin also edits the school's name, messages, contacts and admissions status).
Notices, fee structure, faculty and exam date sheets on the website come from the ERP data.

### Purchase flow (PR → PO → GRN → Accounts)

1. **Purchase requisition (PR):** a teacher raises it (Teacher → **Requisitions**), or the store does
   (Inventory → **Purchase Requisitions** → *New PR* / *Reorder low stock*, filled from items below minimum).
   Numbered `PR/26-27/0001`.
2. **HOD** approves (Teacher → Requisitions → *Department approvals*), skipped when the department has none.
3. **Store check** (Inventory → Purchase Requisitions): give what is in stock, send the rest for approval.
   A store reorder never issues from the stock it replenishes.
4. **Approval:** Principal → **Purchase Approvals**; above the principal's limit also Management
   (Admin → **Purchase Approvals**, where the approval rules are set).
5. **Quotations → purchase order:** Inventory → Purchase Requisitions, quotations compared side by side;
   choosing a dearer one or too few quotations needs a reason. Then Inventory → **Purchase Orders**
   (delivery progress, overdue alerts, printable PO).
6. **Goods receipt (GRN):** Inventory → **Goods Receipts** or the PO's *Record GRN* — received, accepted,
   rejected with a reason; accepted items go into stock; printable GRN; hand-over to the requester.
7. **Accounts:** the GRN appears in Accountant → **Vendor Bills**; the vendor's bill is matched to the PO
   and the GRN (three-way match) and paid with TDS. The store sees each GRN's status there
   (bill awaited → billed → paid).

Vendors and their codes (`V-0001`…) are in Inventory → **Vendor Master**, with each vendor's orders, spend,
on-time delivery and rejection rate. Inventory → **Dashboard** and **Stock Analysis** show stock value,
low stock, ABC classes, fast / slow / non-moving items and what to reorder.

### HR

HR portal: **Staff Attendance**, **Leave Requests**, **Recruitment** (screening, interview rounds, offers),
**Offer Letters** (CTC annexure, joining creates the employee), **Onboarding**, **Training & MIS**,
**Compensation** (CTC calculator, salary structures), **Payroll** (payslips), **Expense Claims**,
**Statutory Compliance** (PF / ESI / PT / TDS), **Exits & F&F**, **HR Settings**. Every staff portal has
**My HR**: payslips, attendance and leave balance, expense claims, trainings with tests, resignation.
The principal also approves expense claims (Principal → **Expense Claims**).

### Demo logins

Sign in with the school code **`greenwood`** and the password **`Demo@1234`** (after
`npm run import:frontend` in the backend). New accounts must change their password at the first sign-in.

| Role | Username | Portal | What it covers |
|------|----------|--------|----------------|
| Admin | `admin` | `/admin` | Login accounts (enable / disable, password reset), roles & permissions, school website |
| Principal | `principal` | `/principal` | Everything academic + finance, inventory, library, school setup, purchase approvals, expense claims |
| Vice Principal | `viceprincipal` | `/vice-principal` | Academics and people, without finance / inventory / school setup |
| Teacher | `T001` … `T006` (e.g. `T002` Ms. Priya Sharma) | `/teacher` | Classes, marks, attendance, assignments, notes, leave, requisitions, My HR; **My Class** for class teachers |
| Student | admission number, e.g. `ADM-2025-1001` (Alice Johnson) | `/student` | Today's classes, homework, own marks (once published), attendance, fees, admit card — with a phone tab bar |
| Parent | father's phone, e.g. `9876511111` | `/parent` | The child's student pages; switch between siblings |
| Accountant | `accountant` | `/accountant` | Fee collection & structure, expenses, payroll, statutory compliance, vendor bills (GRNs from the store), petty cash |
| Receptionist | `reception` | `/reception` | Admission enquiries (incl. from the website), visitor log, new admissions |
| Exam Controller | `exams` | `/exams` | Exam schedule, admit-card eligibility |
| HR Manager | `hr` | `/hr` | Staff, attendance, leave, recruitment → offers → onboarding, training, compensation, payroll, claims, compliance, exits |
| Transport Manager | `transport` | `/transport` | Routes, vehicles, drivers |
| Hostel Warden | `warden` | `/hostel` | Rooms, residents, outpasses |
| Librarian | `librarian` | `/librarian` | Books, issue / return, fines |
| Inventory Manager | `inventory` | `/inventory` | Items, stock analysis, purchase requisitions, purchase orders, goods receipts, vendor master |
| Management | `chairman` | `/group` | Group Dashboard, purchases above the principal's limit (after `npm run seed:procurement`) |

**Group office (after `npm run seed:group`, which makes `greenwood` a group of three schools — Gomti Nagar and
Aliganj in the Lucknow region, Kanpur in the Kanpur region):** `chairman`, `director`, `secretary`, `treasurer`,
`trustee`, `academic.head`, `finance.head`, `hr.head`, `admissions.head`, `purchase.head`, `compliance`, `auditor`,
`inspection`, `transport.head`, `marketing`, `training` → `/group` (all three schools); the Lucknow region office —
`regional.manager` and `lko.asst.director`, `lko.academic`, `lko.subject`, `lko.exams`, `lko.inspector`, `lko.training`,
`lko.counselling`, `lko.accounts`, `lko.auditor`, `lko.hr`, `lko.admissions`, `lko.purchase`, `lko.transport`, `lko.infra`,
`lko.it`, `lko.sports`, `lko.pr`, `lko.office` → the two Lucknow schools; `cluster.head` → the Kanpur school; `admin`, `it.head` → `/admin` (with the Group Dashboard).
The login page has a button for each.

Run `npm run seed:hr` in the backend for demo trainings (with slides and a test) and an expense claim.

Each portal only opens for its own role; everyone else is sent back to the login page. The server
checks every request against the person's role and branch, so hiding a menu is never the only protection.

## Project structure

```
src/
├── main.tsx                  # entry point
├── app/
│   ├── App.tsx               # router provider + toaster
│   └── router.tsx            # all routes (lazy-loaded pages, role guards)
├── components/
│   ├── ui/                   # shadcn/ui primitives
│   ├── layout/               # AppShell (shared frame) + one small config per role
│   ├── theme/                # theme switcher + persisted theme store
│   ├── hr/                   # HR documents (offer letter, payslip, exit letters), candidate pipeline, trainings, exits
│   └── common/               # PageHeader, StatCard, MiniStats, SocialIcons, NotFound, PageLoader
├── modules/                  # one folder per role / domain
│   ├── auth/pages/           # Login, RoleSelector
│   ├── principal/pages/      # principal pages
│   │   └── setup/            # academic year, class, section, student, teacher, parent setup
│   ├── teacher/pages/
│   ├── student/pages/
│   ├── hr/pages/             # HR portal pages and My HR
│   ├── procurement/          # flow.tsx (store check, quotations, GRN, vendor form, PO / GRN print) + PR, PO, GRN, vendor pages
│   ├── library/pages/
│   ├── inventory/            # pages/ (dashboard, items, stock analysis…) + charts.tsx + components/ (setup editors)
│   └── school/forms/         # shared setup forms used by principal setup pages
├── lib/                      # helpers: dates, format (₹, dates), print (A4 documents), useApi, grades, schedules, student stats
├── types/                    # shared data types
├── data/                     # seed / demo data, classes, subjects, timetable, calendar, fee plan
├── store/                    # shared state (one file per domain)
└── styles/                   # Tailwind, theme tokens, fonts, print styles
```

### Data layer

All data comes from the API (SQL Server). The stores in `src/store/` keep the shapes the pages use
(numeric ids, class names like "Class 10-A"), so pages read and write through hooks and never call the API themselves:

```tsx
const { students, addStudent } = useStudents();
const { classes, byClass } = useClassRoster();
const assignments = useAssignments();
submitAssignment(assignmentId, studentId, fileName);
```

- `src/api/client.ts` — fetch wrapper: access token, `X-Branch-Id`, refresh on 401, readable errors.
- `src/api/ids.ts` — maps database GUIDs to the small numbers pages use (kept per school in the browser).
- `src/store/remote.ts` — `remoteStore` / `remoteCollection`: loaded before a portal opens (route guard in
  `src/app/router.tsx`) or the first time a page uses them. Changes show at once and are sent to the API;
  if the API refuses, the change is undone and the reason is shown.
- `src/store/auth.ts` — sign-in, session restore after a reload (refresh cookie), branch, permissions (`can`).
- Each store asks only for what the signed-in role may see (e.g. a student gets their own marks and only
  for published exams; a teacher does not load fee accounts).
- `src/store/publicSite.ts` — what the public school website reads and its forms (no sign-in).
- `src/lib/useApi.ts` — `useApi(path)` / `act(call, message)` for pages whose data no other page shares
  (the HR suite, stock analysis): load, reload, and show errors as toasts.

| Store | API |
|-------|-----|
| `students`, `teachers`, `classes`, `hr` (staff, leave, payroll) | `/students`, `/staff`, `/grades`, `/leaves`, `/payroll` |
| HR suite pages (`useApi`) | `/hr/*`, `/staff-attendance`, `/expense-claims`, `/interviews`, `/offers`, `/onboarding`, `/trainings`, `/separations`, `/payslips`, `/me/*` |
| `timetable`, `attendance`, `exams`, `marks`, `assignments`, `notes` | `/timetable`, `/attendance`, `/exams`, `/marks`, `/assignments`, `/notes` |
| `fees`, `finance` (expenses) | `/fees/*`, `/expenses` |
| `communication` | `/announcements`, `/messages` |
| `website`, `recruitment`, `frontOffice`, `publicSite` | `/website`, `/jobs`, `/job-applications`, `/enquiries`, `/visitors`, `/public/:school/*` |
| `library`, `inventory`, `transport`, `hostel` | `/library`, `/inventory/*`, `/transport`, `/hostel` |
| `procurement` | `/procurement/*`, `/payables/*`, `/petty-cash` |
| `users` | `/users`, `/roles`, `/permissions` |

Only per-device conveniences stay in the browser: the theme, the last school code and branch, and the id map.

### Design

- Brand colour, fonts (Inter + Outfit for headings) and dark mode live in `src/styles/theme.css` as tokens; five themes are available from the top bar.
- Use theme tokens (`text-foreground`, `text-muted-foreground`, `bg-card`, `border-border`, `bg-primary`) instead of fixed greys so every theme works.
- Start pages with `<PageHeader title description actions />` and use `<StatCard />` or `<MiniStats />` for numbers.
- Charts use Recharts through `src/components/ui/chart.tsx` with the validated colours in
  `src/modules/inventory/charts.tsx` (separate light and dark steps).
- Dialogs take their width from `className` (`max-w-2xl`, …); on phones they keep a 1rem margin.
- Every role uses `AppShell`; to add a menu item, add it to that role's `nav` list in `src/components/layout/`.

### Conventions

- Import across folders with the `@/` alias (`@/components/ui/button`); use `./` only for files in the same folder.
- One component per file, file name = exported component name (PascalCase).
- New page: add it under `src/modules/<role>/pages/`, then register it in `src/app/router.tsx` with `page(() => import(...), "Name")`.
- New shared data: add a type in `src/types/`, seed data in `src/data/`, and a store in `src/store/`.
