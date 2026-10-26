# TODO

## Done

- [x] Backend (Express + Prisma + SQL Server): auth, organization / branches, classes, users & roles, students, staff, academics (timetable, attendance, exams & marks, assignments, notes), fees & expenses, leave & payroll, notices & messages, school website (public pages and forms), front office, library, inventory, transport, hostel, purchasing.
- [x] Frontend connected to the API: real sign-in (school code + username + password), session kept across reloads, every portal and page reads and writes the database. Only the theme, the last school / branch and the id map stay in the browser.
- [x] Each role loads only what it may see (students: own marks once results are published, own attendance, class rank without classmates' marks; teachers: no fee accounts; …). The server checks every request.
- [x] Demo school `greenwood` built from `backend/scripts/demo-data/greenwood.json` (`npm run import:frontend`), purchasing demo (`npm run seed:procurement`) and HR demo (`npm run seed:hr`) through the API.
- [x] Database: nightly + hourly verified backups, least-privilege `erp_app` login, foreign keys / checks, versioned migrations (`database/migrate.ps1`, up to 012), encryption of Aadhaar / PAN / bank details, DPDP export & anonymize procedures.
- [x] Automated API tests in the repo: `test:db`, `test:academics`, `test:finance`, `test:communication`, `test:website`, `test:facilities`, `test:procurement`, `test:hrms`, `test:group` (366 checks).
- [x] Purchase flow end to end: PR (`PR/26-27/0001`, from teachers or the store's own "Reorder low stock") → HOD → store check → principal / management → quotations compared side by side → PO → GRN → hand-over → bill (3-way match) → payment with TDS; vendor master with vendor codes (`V-0001`) and delivery / quality scorecards; petty cash.
- [x] Inventory portal: dashboard with charts (stock in vs out, value by category, top vendors), stock analysis (ABC, fast / slow / non-moving, stock cover, reorder list), separate PR, PO, GRN and vendor pages; each GRN shows its status in Accounts (bill awaited → billed → paid); PO and GRN print as A4 documents.
- [x] HR suite: staff attendance, leave balances, recruitment (sourcing, screening, interview rounds), offer letters with CTC annexure, joining (employee code, sign-in, payroll enrolment), onboarding checklist and background verification, compensation (CTC calculator), statutory payroll (PF, ESI, PT, TDS) with payslips, compliance report, expense claims, training calendar with slides, pre / post tests and MIS, exits with exit interview, handover and full & final settlement to Accounts, exit letters, HR settings.
- [x] My HR for every staff portal: payslips, attendance and leave balance, expense claims, trainings and tests, resignation.
- [x] Student and parent portal made mobile friendly: phone tab bar, today's classes, "needs attention" list, day-by-day timetable, clearer fees with receipts; academic-year labels come from the Academic Year setup.
- [x] All npm packages updated to their latest versions (React 19, React Router 8, Vite 8, TypeScript 7, Prisma 7 with the SQL Server adapter, Zod 4, Recharts 3, …); PATCH requests no longer reset fields they did not send (`forPatch`).

- [x] Region office: 18 built-in region-level roles (assistant regional director, academic / subject / exam / training / counselling coordinators, inspector, accounts officer, auditor, HR officer, admissions, purchase, transport, infrastructure, IT, sports, PR, office staff) — each sees only their region's schools; demo: the Lucknow region office (`lko.*`).
- [x] Group office: 14 more built-in head-office / cluster roles (director, secretary, treasurer, trustee, admissions, purchase, IT, compliance, auditor, inspection, transport, marketing, training, cluster head) and a Group portal with the Group Dashboard (schools side by side, region totals, targets flagged, CSV); demo: `npm run seed:group` makes `greenwood` a group of three schools in two regions.

## Next

- [ ] **Security:** change the `sa` password (it was shared in chat); keep a copy of `DATA_ENCRYPTION_KEY` somewhere safe (without it encrypted Aadhaar / PAN / bank details cannot be read); use a real TLS certificate instead of `trustServerCertificate=true` in production.
- [ ] `npm audit` (backend) reports `@azure/msal-node` through `mssql` → `tedious` → `@azure/identity`; it is used only for Azure AD sign-in, which the API does not use. Update when `@azure/identity` ships a fixed version.
- [ ] **Files:** assignment submissions, study notes, expense-claim receipts and job-application resumes store only the file name today. Add blob storage (Azure Blob / S3) with upload and signed download URLs.
- [ ] **Online fee payments:** integrate a payment gateway (Razorpay) — order → checkout → verified webhook → `FeePayment`. Until then `DEMO_PAYMENTS=true` (demo only) lets parents "pay"; it must be off in production.
- [ ] **Timetable generator** (principal): save a generated timetable with `PUT /timetable/sections/:id` (the API exists; the page still keeps its result in the page only and uses its own preset teachers and subjects).
- [ ] Some dashboard figures are still illustrative (e.g. the principal's weekly attendance trend chart) — drive them from the API.
- [ ] Teacher attendance can only be taken for a subject that has a period in the class timetable that day; add "extra class" registers if needed.
- [ ] Parents with several children: messages are tied to the child chosen; test with real sibling data.
- [ ] Transport fees and hostel fees are not yet added to the student's fee account; transport allocation (student ↔ stop) has no page yet.
- [ ] Notifications: SMS / WhatsApp / email for absences, fee reminders, results, offer letters, payslips (`Notification` table exists, nothing sends yet).
- [ ] Holidays: let the principal add festival holidays (lunar-calendar dates) for each year.
- [ ] HR: link the `hr` / `principal` demo sign-ins to staff records so their My HR shows data; Form 16 and PF ECR file export; bank salary-transfer file.
- [ ] Role Selector (`/role-select`) is not linked anywhere; remove it or turn it into a role switch for people with several roles.
- [ ] Purchase flow: TDS challan / 26Q export.
- [ ] Websites: replace sample content before going live (photos, CBSE disclosure PDFs, toppers, events, testimonials); the product site lists some planned features (WhatsApp/SMS, OTP login, GPS, Tally export, biometrics, payment gateway) — build or remove them; have a lawyer review `/privacy` and `/terms`.
- [ ] Hosting: Azure SQL (India) with automated backups; deploy the API and the built frontend; one subdomain per school for its website.
- [ ] Group level next: settings and fee plans set once for the group with school overrides; staff and student transfers between schools; approvals that go up to the region / head office; group circulars; nightly snapshots for chains with hundreds of schools; a flexible hierarchy (more than one level of regions) for DAV-sized groups.
- [ ] Optional: move `frontend/src/store/` to Redux Toolkit / RTK Query. Pages only use hooks, so only `frontend/src/store/` changes.
