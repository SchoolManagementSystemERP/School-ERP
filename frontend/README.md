# School ERP — Frontend

A role-based school management frontend built with React 18, Vite, Tailwind CSS v4 and shadcn/ui.
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

### Purchase flow

Teacher → **Requisitions** · HOD (same page, *Department approvals*) · Inventory → **Store & Purchase**
(store check, quotations, purchase orders, goods receipt, hand-over, vendors) · Principal → **Purchase Approvals** ·
Admin → **Purchase Approvals** (Management, above the principal's limit, and the approval rules) ·
Accountant → **Vendor Bills** (three-way match, payment with TDS, petty cash).

### Demo logins

Sign in with the school code **`greenwood`** and the password **`Demo@1234`** (after
`npm run import:frontend` in the backend). New accounts must change their password at the first sign-in.

| Role | Username | Portal | What it covers |
|------|----------|--------|----------------|
| Admin | `admin` | `/admin` | Login accounts (enable / disable, password reset), roles & permissions, school website |
| Principal | `principal` | `/principal` | Everything academic + finance, inventory, library, school setup, purchase approvals |
| Vice Principal | `viceprincipal` | `/vice-principal` | Academics and people, without finance / inventory / school setup |
| Teacher | `T001` … `T006` (e.g. `T002` Ms. Priya Sharma) | `/teacher` | Classes, marks, attendance, assignments, notes, leave, requisitions; **My Class** for class teachers |
| Student | admission number, e.g. `ADM-2025-1001` (Alice Johnson) | `/student` | Own marks (once published), attendance, assignments, fees, admit card |
| Parent | father's phone, e.g. `9876511111` | `/parent` | The child's student pages; switch between siblings |
| Accountant | `accountant` | `/accountant` | Fee collection & structure, expenses, payroll, vendor bills, petty cash |
| Receptionist | `reception` | `/reception` | Admission enquiries (incl. from the website), visitor log, new admissions |
| Exam Controller | `exams` | `/exams` | Exam schedule, admit-card eligibility |
| HR Manager | `hr` | `/hr` | Staff directory, leave approval, payroll, recruitment |
| Transport Manager | `transport` | `/transport` | Routes, vehicles, drivers |
| Hostel Warden | `warden` | `/hostel` | Rooms, residents, outpasses |
| Librarian | `librarian` | `/librarian` | Books, issue / return, fines |
| Inventory Manager | `inventory` | `/inventory` | Items, stock, store & purchase |
| Management | `chairman` | `/admin` | Purchases above the principal's limit (after `npm run seed:procurement`) |

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
│   └── common/               # PageHeader, StatCard, NotFound, PageLoader
├── modules/                  # one folder per role / domain
│   ├── auth/pages/           # Login, RoleSelector
│   ├── principal/pages/      # principal pages
│   │   └── setup/            # academic year, class, section, student, teacher, parent setup
│   ├── teacher/pages/
│   ├── student/pages/
│   ├── library/pages/
│   ├── inventory/            # pages/ + components/ (setup editors)
│   └── school/forms/         # shared setup forms used by principal setup pages
├── lib/                      # helpers: dates, grades, seeded random, schedules, student stats
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

| Store | API |
|-------|-----|
| `students`, `teachers`, `classes`, `hr` (staff, leave, payroll) | `/students`, `/staff`, `/grades`, `/leaves`, `/payroll` |
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
- Start pages with `<PageHeader title description actions />` and use `<StatCard />` for numbers.
- Every role uses `AppShell`; to add a menu item, add it to that role's `nav` list in `src/components/layout/`.

### Conventions

- Import across folders with the `@/` alias (`@/components/ui/button`); use `./` only for files in the same folder.
- One component per file, file name = exported component name (PascalCase).
- New page: add it under `src/modules/<role>/pages/`, then register it in `src/app/router.tsx` with `page(() => import(...), "Name")`.
- New shared data: add a type in `src/types/`, seed data in `src/data/`, and a store in `src/store/`.
