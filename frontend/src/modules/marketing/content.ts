import {
  BadgeIndianRupee, Banknote, BarChart3, Bell, BookOpen, Briefcase, Building2, Bus, CalendarCheck, CalendarDays, ClipboardCheck,
  ClipboardList, Contact, FileText, Fingerprint, Globe, GraduationCap, HeartHandshake, Home, IdCard, KeyRound, Library,
  LineChart, Lock, Mail, MessageCircle, MessagesSquare, Network, Package, PenTool, Receipt, School, ScrollText, Server,
  ShieldCheck, Smartphone, Upload, UserCog, Users, Wallet, type LucideIcon,
} from "lucide-react";

export const PRODUCT = {
  name: "SchoolERP",
  domain: "schoolerp.in",
  email: "hello@schoolerp.in",
  phone: "+91 90000 12345",
  whatsapp: "+91 90000 12345",
  address: "Lucknow, Uttar Pradesh, India",
};

export const NAV_LINKS = [
  { label: "Features", href: "#modules" },
  { label: "Roles", href: "#roles" },
  { label: "Multi-branch", href: "#multi-branch" },
  { label: "Pricing", href: "#pricing" },
  { label: "Security", href: "#security" },
  { label: "FAQ", href: "#faq" },
];

export const HERO_POINTS = ["14 role-based portals", "Online fees with UPI", "Unlimited branches", "Free school website"];

export const CAPABILITY_STATS = [
  { value: "14", label: "Role-based portals" },
  { value: "20+", label: "Modules in one place" },
  { value: "∞", label: "Branches per group" },
  { value: "7 days", label: "Typical go-live" },
];

export const PAINS = [
  { before: "Attendance in registers, totals at month-end", after: "Attendance in 30 seconds per class; parents get an SMS the same minute" },
  { before: "Fee receipts in Excel, dues chased on phone", after: "Online UPI payments, automatic receipts, late fees and reminders" },
  { before: "Report cards typed by hand every term", after: "Marks entered once — report cards and rank lists generate themselves" },
  { before: "Every branch runs its own software", after: "One login for the whole group; compare branches on one dashboard" },
  { before: "Parents call the office for every small thing", after: "Parent app with homework, marks, fees, notices and messages" },
  { before: "Website updated once a year", after: "School website updates itself with notices, results and admissions" },
];

export type ModuleGroup = "Academics" | "Finance" | "Administration" | "Facilities" | "Communication";
export interface ProductModule {
  group: ModuleGroup;
  icon: LucideIcon;
  title: string;
  text: string;
  points: string[];
}

export const MODULES: ProductModule[] = [
  { group: "Academics", icon: Users, title: "Student Information", text: "Complete digital record of every student from admission to alumni.", points: ["Online admission & documents", "Siblings, guardians, health records", "TC, bonafide & ID cards"] },
  { group: "Academics", icon: CalendarCheck, title: "Attendance", text: "Daily or period-wise attendance on phone or biometric device.", points: ["Mark a class in 30 seconds", "Instant absent SMS to parents", "Monthly and defaulter reports"] },
  { group: "Academics", icon: ClipboardCheck, title: "Exams & Report Cards", text: "CBSE / ICSE / State board grading, built in.", points: ["Exam schedule & admit cards", "Marks entry with moderation", "Report cards, rank lists, analysis"] },
  { group: "Academics", icon: CalendarDays, title: "Timetable", text: "Clash-free timetable for every class and teacher.", points: ["Auto-generate in minutes", "Substitute teacher planning", "Teacher workload view"] },
  { group: "Academics", icon: PenTool, title: "Homework & Notes", text: "Assignments, submissions and study material online.", points: ["Upload notes, PDFs & videos", "Online submission & grading", "Late-submission tracking"] },
  { group: "Finance", icon: BadgeIndianRupee, title: "Fees", text: "Fee plans, concessions, online payments and receipts.", points: ["UPI, cards, net banking (Razorpay)", "Installments, late fee, concessions", "Due reminders on SMS / WhatsApp"] },
  { group: "Finance", icon: Receipt, title: "Accounts & Expenses", text: "Track every rupee that comes in and goes out.", points: ["Expense vouchers & approvals", "Day book, cash book, P&L", "Export to Tally"] },
  { group: "Finance", icon: Wallet, title: "Payroll", text: "Salary in one click, with statutory deductions.", points: ["PF, ESI, TDS, professional tax", "Payslips emailed to staff", "Bank transfer file"] },
  { group: "Administration", icon: Briefcase, title: "HR & Recruitment", text: "From job posting to joining to exit.", points: ["Careers page & applications", "Staff records & documents", "Leave with approvals"] },
  { group: "Administration", icon: Contact, title: "Front Office", text: "Enquiries, visitors and calls at the reception.", points: ["Admission enquiry pipeline", "Visitor log with photo", "Follow-up reminders"] },
  { group: "Administration", icon: UserCog, title: "Users & Roles", text: "Exactly the right access for every person.", points: ["Custom roles & permissions", "Branch / region / group scope", "Disable access instantly"] },
  { group: "Administration", icon: BarChart3, title: "Reports & Analytics", text: "Dashboards for principals, owners and trustees.", points: ["Fee collection & dues", "Attendance & result trends", "Branch comparison"] },
  { group: "Facilities", icon: Library, title: "Library", text: "Catalogue, issue, return and fines.", points: ["Barcode / ISBN entry", "Issue & return in seconds", "Overdue reminders"] },
  { group: "Facilities", icon: Bus, title: "Transport", text: "Routes, stops, vehicles and bus fees.", points: ["Route & stop planning", "Vehicle documents & expiry alerts", "GPS tracking for parents"] },
  { group: "Facilities", icon: Home, title: "Hostel", text: "Rooms, residents, mess and outpasses.", points: ["Room allocation", "Outpass with parent approval", "Hostel fee & attendance"] },
  { group: "Facilities", icon: Package, title: "Inventory", text: "Stock of every item across stores and labs.", points: ["Purchase & issue entries", "Low-stock alerts", "Asset register"] },
  { group: "Communication", icon: Bell, title: "Notices & Circulars", text: "Reach exactly the right people.", points: ["By class, section, staff or everyone", "App, SMS, WhatsApp & email", "Read receipts"] },
  { group: "Communication", icon: MessagesSquare, title: "Messages", text: "Two-way chat between parents, teachers and office.", points: ["Parent–teacher messages", "Office broadcast", "Message history"] },
  { group: "Communication", icon: Smartphone, title: "Parent & Student App", text: "Everything a family needs, on their phone.", points: ["Homework, marks & attendance", "Pay fees online", "Multiple children, one login"] },
  { group: "Communication", icon: Globe, title: "School Website", text: "A beautiful website that updates itself.", points: ["Notices, results & gallery", "Admission enquiry form", "Careers page & CBSE disclosure"] },
];

export const MODULE_GROUPS: ModuleGroup[] = ["Academics", "Finance", "Administration", "Facilities", "Communication"];

export interface RoleInfo {
  key: string;
  icon: LucideIcon;
  title: string;
  summary: string;
  can: string[];
}

export const ROLES: RoleInfo[] = [
  { key: "owner", icon: Building2, title: "Chairman / Owner", summary: "The whole group at a glance.", can: ["Compare branches on fees, attendance and results", "See collections and dues across the group", "Approve budgets and big expenses"] },
  { key: "principal", icon: School, title: "Principal", summary: "Run the school from one dashboard.", can: ["Today's attendance, absent teachers and fee collection", "Approve leave, publish results, send notices", "Set up classes, sections, teachers and timetable"] },
  { key: "teacher", icon: GraduationCap, title: "Teacher", summary: "Less paperwork, more teaching.", can: ["Mark attendance and enter marks from the phone", "Give homework, upload notes, check submissions", "Message parents, apply for leave"] },
  { key: "student", icon: BookOpen, title: "Student", summary: "Everything for class in one place.", can: ["Timetable, homework and study material", "Marks, report cards and admit card", "Notices and holiday calendar"] },
  { key: "parent", icon: HeartHandshake, title: "Parent", summary: "Stay close to your child's school life.", can: ["Attendance alerts and marks", "Pay fees online and download receipts", "Message the class teacher"] },
  { key: "accountant", icon: Banknote, title: "Accountant", summary: "Fees and accounts without Excel.", can: ["Collect fees at the counter or online", "Track dues, concessions and late fees", "Expenses, payroll and reports"] },
  { key: "reception", icon: Contact, title: "Front Office", summary: "A smooth first impression.", can: ["Admission enquiries with follow-ups", "Visitor log", "New admissions"] },
  { key: "hr", icon: Briefcase, title: "HR", summary: "People, leave and salaries.", can: ["Post jobs and manage applications", "Staff records and documents", "Leave approvals and payroll"] },
  { key: "exams", icon: ClipboardList, title: "Exam Controller", summary: "Exams without chaos.", can: ["Date sheets and seating", "Admit cards", "Results and analysis"] },
  { key: "transport", icon: Bus, title: "Transport Manager", summary: "Every bus, every stop.", can: ["Routes, stops and vehicles", "Student allocation", "Document expiry alerts"] },
  { key: "warden", icon: Home, title: "Hostel Warden", summary: "Rooms and residents.", can: ["Room allocation", "Outpasses", "Hostel attendance"] },
  { key: "librarian", icon: Library, title: "Librarian", summary: "A library that runs itself.", can: ["Catalogue books", "Issue and return", "Fines and overdue lists"] },
  { key: "inventory", icon: Package, title: "Store / Inventory", summary: "Know what you have.", can: ["Stock in and out", "Low-stock alerts", "Asset register"] },
  { key: "admin", icon: KeyRound, title: "IT / System Admin", summary: "Control who sees what.", can: ["Create users and roles", "Enable or disable logins", "System settings and backups"] },
];

export const MULTI_BRANCH_POINTS = [
  { icon: Network, title: "Group → Region → Branch", text: "Organise 2 or 200 campuses the way your trust actually works." },
  { icon: BarChart3, title: "Group dashboard", text: "Fees, attendance, results and admissions for every branch, side by side." },
  { icon: Users, title: "Common or local settings", text: "Set one fee structure and grading for the group, or let branches override." },
  { icon: IdCard, title: "One login, many campuses", text: "A teacher at two campuses or a regional head sees exactly their branches." },
  { icon: ScrollText, title: "Student transfers", text: "Move a student between branches with history, marks and fees intact." },
  { icon: LineChart, title: "Consolidated reports", text: "Board-ready reports for trustees in one click." },
];

export const STEPS = [
  { title: "Book a demo", text: "A 30-minute call where we show the software with your school's needs in mind." },
  { title: "Share your data", text: "Send your Excel sheets of students, staff and fees — we import everything for you." },
  { title: "Training", text: "Live training for office staff, teachers and principals, plus videos in Hindi and English." },
  { title: "Go live", text: "Parents get their app logins, and you are running — usually within 7 days." },
];

export const SECURITY = [
  { icon: Lock, title: "Your data stays yours", text: "Each school's data is isolated at the database level — no other school can ever see it." },
  { icon: ShieldCheck, title: "Role-based access", text: "Every person sees only what their role allows, only for their branch." },
  { icon: Fingerprint, title: "Secure sign-in", text: "Encrypted passwords, short-lived sessions, OTP for parents, instant disable." },
  { icon: FileText, title: "Audit trail", text: "Every change to fees, marks and records is logged with who, when and what." },
  { icon: Server, title: "Daily backups in India", text: "Hosted in Indian data centres with automated backups and point-in-time restore." },
  { icon: ScrollText, title: "DPDP Act ready", text: "Parental consent, privacy notice, data export and deletion on request." },
];

export const INTEGRATIONS = [
  { icon: BadgeIndianRupee, name: "Razorpay / UPI" },
  { icon: MessageCircle, name: "WhatsApp" },
  { icon: Smartphone, name: "SMS" },
  { icon: Mail, name: "Email" },
  { icon: Receipt, name: "Tally export" },
  { icon: Fingerprint, name: "Biometric devices" },
  { icon: Bus, name: "GPS trackers" },
  { icon: Upload, name: "Excel import" },
];

export interface Plan {
  code: string;
  name: string;
  monthly: number | null;
  tagline: string;
  limits: string;
  highlight?: boolean;
  features: string[];
}

/** Prices per branch per month (match the Plan table in backend/database/seed.sql). */
export const PLANS: Plan[] = [
  {
    code: "basic", name: "Basic", monthly: 2999, tagline: "For a single school getting started", limits: "Up to 500 students",
    features: ["Students, attendance & marks", "Fees with online payment", "Notices & messages", "Parent & student app", "School website", "Email support"],
  },
  {
    code: "pro", name: "Pro", monthly: 5999, tagline: "Everything a growing school needs", limits: "Up to 2,000 students", highlight: true,
    features: ["Everything in Basic", "Exams, report cards & timetable", "Accounts, payroll & HR", "Library, transport, hostel, inventory", "WhatsApp & SMS alerts", "Priority phone support"],
  },
  {
    code: "enterprise", name: "Enterprise", monthly: 9999, tagline: "For school groups and chains", limits: "Unlimited students",
    features: ["Everything in Pro", "Unlimited branches & regions", "Group dashboard & comparisons", "Custom roles & approvals", "API access & integrations", "Dedicated account manager"],
  },
];

export const COMPARISON: { feature: string; plans: [boolean | string, boolean | string, boolean | string] }[] = [
  { feature: "Students per branch", plans: ["500", "2,000", "Unlimited"] },
  { feature: "Student information & admissions", plans: [true, true, true] },
  { feature: "Attendance with parent SMS", plans: [true, true, true] },
  { feature: "Online fee payment", plans: [true, true, true] },
  { feature: "Parent & student app", plans: [true, true, true] },
  { feature: "School website", plans: [true, true, true] },
  { feature: "Exams, report cards, timetable", plans: [false, true, true] },
  { feature: "Accounts, payroll, HR & recruitment", plans: [false, true, true] },
  { feature: "Library, transport, hostel, inventory", plans: [false, true, true] },
  { feature: "WhatsApp alerts", plans: [false, true, true] },
  { feature: "Multiple branches & group dashboard", plans: [false, false, true] },
  { feature: "Custom roles & API access", plans: [false, false, true] },
  { feature: "Support", plans: ["Email", "Phone + email", "Dedicated manager"] },
];

export const USE_CASES = [
  { icon: School, title: "A single school", text: "Replace registers, Excel and three different apps with one simple system your staff will actually use.", points: ["Up and running in a week", "Teachers use it on their phones", "Parents pay fees online"] },
  { icon: Building2, title: "A school chain", text: "Run every campus on the same system and see the whole group from one dashboard.", points: ["Group → region → branch structure", "Common fee & grading policies", "Branch comparison reports"] },
  { icon: GraduationCap, title: "A trust with school + college", text: "Different boards, streams and fee structures, managed together.", points: ["CBSE, ICSE, State board & university", "Separate or shared accounts", "One login for the management"] },
];

export const FAQS = [
  { q: "Do we need to install anything?", a: "No. SchoolERP runs in the browser on any computer, and on Android and iPhone for teachers, students and parents. We host it, update it and back it up for you." },
  { q: "Can you move our existing data?", a: "Yes. Send us your students, staff and fee data in Excel (or export from your old software) and our team imports it for you at no extra cost." },
  { q: "Is our data safe? Can other schools see it?", a: "Each school's data is separated inside the database itself, so no other school can see it even by mistake. Data is encrypted in transit, hosted in India and backed up daily." },
  { q: "We have several branches. Is that supported?", a: "Yes — that's what Enterprise is for. Organise branches into regions, give each person access to exactly their branches, and compare all campuses on one dashboard." },
  { q: "How do parents pay fees online?", a: "Parents pay through the app or a link with UPI, cards or net banking. The money goes directly to your school's bank account through Razorpay; receipts are generated automatically." },
  { q: "Is there a setup fee or a long contract?", a: "No setup fee for Basic and Pro. You can pay monthly or yearly (two months free on yearly) and cancel any time — you can export all your data whenever you want." },
  { q: "Do you provide training and support?", a: "Yes. Live online training for every role, short videos in Hindi and English, and support on phone, WhatsApp and email during school hours." },
  { q: "Can we customise roles and report cards?", a: "Yes. Create your own roles with the exact permissions you want, and choose or design the report-card format your board and school use." },
  { q: "Does it work for CBSE mandatory public disclosure?", a: "Yes. The included school website has a ready Mandatory Public Disclosure page that you fill in once and keep updated." },
];
