# TODO

## Done

- [x] Backend (Express + Prisma + SQL Server): auth, organization / branches, classes, users & roles, students, staff, academics (timetable, attendance, exams & marks, assignments, notes), fees & expenses, leave & payroll, notices & messages, school website (public pages and forms), front office, library, inventory, transport, hostel, purchasing.
- [x] Frontend connected to the API: real sign-in (school code + username + password), session kept across reloads, every portal and page reads and writes the database. Only the theme, the last school / branch and the id map stay in the browser.
- [x] Each role loads only what it may see (students: own marks once results are published, own attendance, class rank without classmates' marks; teachers: no fee accounts; …). The server checks every request.
- [x] Demo school `greenwood` built from `backend/scripts/demo-data/greenwood.json` (`npm run import:frontend`), purchasing demo through the API (`npm run seed:procurement`).
- [x] Database: nightly + hourly verified backups, least-privilege `erp_app` login, foreign keys / checks, versioned migrations (`database/migrate.ps1`, up to 009), encryption of Aadhaar / PAN / bank details, DPDP export & anonymize procedures.
- [x] Automated API tests in the repo: `test:db`, `test:academics`, `test:finance`, `test:communication`, `test:website`, `test:facilities`, `test:procurement` (248 checks).
- [x] Purchase flow end to end: indent → HOD → store → principal / management → quotations → PO → GRN → hand-over → bill (3-way match) → payment with TDS; vendors; petty cash.

## Next

- [ ] **Security:** change the `sa` password (it was shared in chat); keep a copy of `DATA_ENCRYPTION_KEY` somewhere safe (without it encrypted Aadhaar / PAN / bank details cannot be read); use a real TLS certificate instead of `trustServerCertificate=true` in production.
- [ ] **Files:** assignment submissions, study notes and job-application resumes store only the file name today. Add blob storage (Azure Blob / S3) with upload and signed download URLs.
- [ ] **Online fee payments:** integrate a payment gateway (Razorpay) — order → checkout → verified webhook → `FeePayment`. Until then `DEMO_PAYMENTS=true` (demo only) lets parents "pay"; it must be off in production.
- [ ] **Timetable generator** (principal): save a generated timetable with `PUT /timetable/sections/:id` (the API exists; the page still keeps its result in the page only and uses its own preset teachers and subjects).
- [ ] Some dashboard figures are still illustrative (e.g. the principal's weekly attendance trend chart, "Academic Year 2025-26" labels in a few pages) — drive them from the API / Academic Year setup.
- [ ] Teacher attendance can only be taken for a subject that has a period in the class timetable that day; add "extra class" registers if needed.
- [ ] Parents with several children: messages are tied to the child chosen; test with real sibling data.
- [ ] Transport fees and hostel fees are not yet added to the student's fee account; transport allocation (student ↔ stop) has no page yet.
- [ ] Notifications: SMS / WhatsApp / email for absences, fee reminders, results (`Notification` table exists, nothing sends yet).
- [ ] Holidays: let the principal add festival holidays (lunar-calendar dates) for each year.
- [ ] Role Selector (`/role-select`) is not linked anywhere; remove it or turn it into a role switch for people with several roles.
- [ ] Purchase flow: TDS challan / 26Q export; PO and GRN as PDF.
- [ ] Websites: replace sample content before going live (photos, CBSE disclosure PDFs, toppers, events, testimonials); the product site lists some planned features (WhatsApp/SMS, OTP login, GPS, Tally export, biometrics, payment gateway) — build or remove them; have a lawyer review `/privacy` and `/terms`.
- [ ] Hosting: Azure SQL (India) with automated backups; deploy the API and the built frontend; one subdomain per school for its website.
- [ ] Optional: move `frontend/src/store/` to Redux Toolkit / RTK Query. Pages only use hooks, so only `frontend/src/store/` changes.
