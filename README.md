# School ERP

School management software for single schools and school chains (many branches under one
organization), with portals for 14 roles — admin, principal, teachers, students, parents,
accounts, HR, front office, exams, transport, hostel, library and inventory.

```
School ERP/
├── frontend/   React 18 + Vite + Tailwind app (works today with demo data in the browser)
├── backend/    REST API (Node.js + Express + Prisma) and database (MS SQL Server)
├── TODO.md     what is left to do
└── README.md
```

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open the link shown in the terminal (usually http://localhost:5173). The login page has a demo
button for every role. Details and all demo logins: [frontend/README.md](frontend/README.md).

> On Windows PowerShell, if `npm` is blocked by the execution policy, use `npm.cmd run dev`.

## Backend

[backend/README.md](backend/README.md) — creating the database, running the API (`npm run dev` in
`backend/`), demo accounts and the endpoint list.
The full design (multi-school tenancy, roles, tables, APIs, phases) is in
[backend/DESIGN.md](backend/DESIGN.md).
