import type { ComponentType } from "react";
import { createBrowserRouter, redirect, type RouteObject } from "react-router";
import { AccountantLayout } from "@/components/layout/AccountantLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { ExamsLayout } from "@/components/layout/ExamsLayout";
import { HostelLayout } from "@/components/layout/HostelLayout";
import { GroupLayout } from "@/components/layout/GroupLayout";
import { HRLayout } from "@/components/layout/HRLayout";
import { InventoryLayout } from "@/components/layout/InventoryLayout";
import { LibrarianLayout } from "@/components/layout/LibrarianLayout";
import { ParentLayout } from "@/components/layout/ParentLayout";
import { PrincipalLayout } from "@/components/layout/PrincipalLayout";
import { ReceptionLayout } from "@/components/layout/ReceptionLayout";
import { StudentLayout } from "@/components/layout/StudentLayout";
import { TeacherLayout } from "@/components/layout/TeacherLayout";
import { TransportLayout } from "@/components/layout/TransportLayout";
import { VicePrincipalLayout } from "@/components/layout/VicePrincipalLayout";
import { NotFound } from "@/components/common/NotFound";
import { PageLoader } from "@/components/common/PageLoader";
import { Login } from "@/modules/auth/pages/Login";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { gradeStore, sectionStore } from "@/store/classes";
import { preload } from "@/store/remote";
import { subjectStore, timetableStore } from "@/store/timetable";
import { attendanceStore } from "@/store/attendance";
import { examStore } from "@/store/exams";
import { marksStore } from "@/store/marks";
import { assignmentStore } from "@/store/assignments";
import { noteStore } from "@/store/notes";
import { feeAccountStore, feePaymentStore, feePlanStore, feeRulesStore } from "@/store/fees";
import { expenseStore } from "@/store/finance";
import { announcementStore, messageStore } from "@/store/communication";
import { alumniStore, feedbackStore, siteStore } from "@/store/website";
import { applicationStore, jobStore } from "@/store/recruitment";
import { enquiryStore, visitorStore } from "@/store/frontOffice";
import { bookStore, loanStore } from "@/store/library";
import { itemStore, movementStore, settingsStore } from "@/store/inventory";
import { routeStore, vehicleStore } from "@/store/transport";
import { outpassStore, residentStore, roomStore } from "@/store/hostel";
import { procurementStores } from "@/store/procurement";
import { permissionStore, roleStore, userStore } from "@/store/users";
import { leaveStore, payrollStore, staffStore } from "@/store/hr";
import { currentRole, ensureSession, lastLoginPath, type Role } from "@/store/session";
import { studentStore } from "@/store/students";
import { teacherStore } from "@/store/teachers";

/**
 * Lazily loads a named page export so every page ships as its own chunk.
 * Usage: page(() => import("@/modules/x/pages/Foo"), "Foo")
 */
function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M & string) {
  return { lazy: async () => ({ Component: (await load())[name] as ComponentType }) };
}

/**
 * Route guard: restores the API session (refresh cookie after a reload), checks the portal, and
 * loads the data every portal needs. Teachers first, so class-teacher names resolve.
 */
const requireRole = (role: Role) => async () => {
  if (!(await ensureSession()) || currentRole() !== role) throw redirect(lastLoginPath());
  // the group office reads its own totals (GET /group/overview), not one school's records
  if (role === "group") return null;
  try {
    await preload([teacherStore]);
    await preload([gradeStore, sectionStore, studentStore, subjectStore, timetableStore, examStore]);
    // academic records (each loader returns nothing for roles that may not see them)
    await preload([attendanceStore, marksStore, assignmentStore, noteStore]);
    await preload([feePlanStore, feeRulesStore, feeAccountStore, feePaymentStore, expenseStore, staffStore, leaveStore, payrollStore]);
    await preload([announcementStore, messageStore, siteStore, feedbackStore, alumniStore, jobStore, applicationStore, enquiryStore, visitorStore]);
    await preload([bookStore, loanStore, itemStore, movementStore, settingsStore, vehicleStore, routeStore, roomStore, residentStore, outpassStore]);
    await preload(procurementStores);
    await preload([userStore, roleStore, permissionStore]);
  } catch (e) {
    toast.error(`Some data could not be loaded: ${errorMessage(e)}`);
  }
  return null;
};

/** A role's portal: guarded layout + its pages. */
const portal = (path: string, role: Role, Layout: ComponentType, children: RouteObject[]): RouteObject => ({
  path, loader: requireRole(role), Component: Layout, HydrateFallback: PageLoader, children,
});

// ── Pages shared by several portals ──────────────────────────────────────────

const P = {
  dashboard: page(() => import("@/modules/principal/pages/PrincipalDashboard"), "PrincipalDashboard"),
  reports: page(() => import("@/modules/principal/pages/PrincipalReports"), "PrincipalReports"),
  students: page(() => import("@/modules/principal/pages/PrincipalStudents"), "PrincipalStudents"),
  attendance: page(() => import("@/modules/principal/pages/PrincipalAttendance"), "PrincipalAttendance"),
  marks: page(() => import("@/modules/principal/pages/PrincipalMarks"), "PrincipalMarks"),
  assignments: page(() => import("@/modules/principal/pages/PrincipalAssignments"), "PrincipalAssignments"),
  timetable: page(() => import("@/modules/principal/pages/PrincipalTimetable"), "PrincipalTimetable"),
  notes: page(() => import("@/modules/principal/pages/PrincipalNotes"), "PrincipalNotes"),
  teachers: page(() => import("@/modules/principal/pages/PrincipalTeachers"), "PrincipalTeachers"),
  finance: page(() => import("@/modules/principal/pages/PrincipalFinance"), "PrincipalFinance"),
  inventory: page(() => import("@/modules/principal/pages/PrincipalInventory"), "PrincipalInventory"),
  library: page(() => import("@/modules/principal/pages/PrincipalLibrary"), "PrincipalLibrary"),
  communication: page(() => import("@/modules/principal/pages/PrincipalCommunication"), "PrincipalCommunication"),
  setupAcademicYear: page(() => import("@/modules/principal/pages/setup/PrincipalAcademicYear"), "PrincipalAcademicYear"),
  setupClasses: page(() => import("@/modules/principal/pages/setup/PrincipalClassSetup"), "PrincipalClassSetup"),
  setupSections: page(() => import("@/modules/principal/pages/setup/PrincipalSectionSetup"), "PrincipalSectionSetup"),
  setupStudents: page(() => import("@/modules/principal/pages/setup/PrincipalStudentSetup"), "PrincipalStudentSetup"),
  setupTeachers: page(() => import("@/modules/principal/pages/setup/PrincipalTeacherSetup"), "PrincipalTeacherSetup"),
  setupParents: page(() => import("@/modules/principal/pages/setup/PrincipalParentSetup"), "PrincipalParentSetup"),
  setupInventory: page(() => import("@/modules/inventory/pages/InventorySetup"), "InventorySetup"),
};

const S = {
  dashboard: page(() => import("@/modules/student/pages/StudentDashboard"), "StudentDashboard"),
  marks: page(() => import("@/modules/student/pages/StudentMarks"), "StudentMarks"),
  assignments: page(() => import("@/modules/student/pages/StudentAssignments"), "StudentAssignments"),
  attendance: page(() => import("@/modules/student/pages/StudentAttendance"), "StudentAttendance"),
  fees: page(() => import("@/modules/student/pages/StudentFees"), "StudentFees"),
  feesSuccess: page(() => import("@/modules/student/pages/StudentFeesSuccess"), "StudentFeesSuccess"),
  timetable: page(() => import("@/modules/student/pages/StudentTimetable"), "StudentTimetable"),
  holidays: page(() => import("@/modules/student/pages/StudentHolidays"), "StudentHolidays"),
  admitCard: page(() => import("@/modules/student/pages/StudentAdmitCard"), "StudentAdmitCard"),
  resources: page(() => import("@/modules/student/pages/StudentResources"), "StudentResources"),
  communication: page(() => import("@/modules/student/pages/StudentCommunication"), "StudentCommunication"),
};

/** Student pages, also used (for their child) by parents. */
const studentPages: RouteObject[] = [
  { index: true, ...S.dashboard },
  { path: "marks", ...S.marks },
  { path: "assignments", ...S.assignments },
  { path: "attendance", ...S.attendance },
  { path: "fees", ...S.fees },
  { path: "fees/success", ...S.feesSuccess },
  { path: "timetable", ...S.timetable },
  { path: "holidays", ...S.holidays },
  { path: "admit-card", ...S.admitCard },
  { path: "resources", ...S.resources },
  { path: "communication", ...S.communication },
];

const payroll = page(() => import("@/modules/hr/pages/Payroll"), "Payroll");
const compliance = page(() => import("@/modules/hr/pages/Compliance"), "Compliance");
const expenseClaims = page(() => import("@/modules/hr/pages/ExpenseClaims"), "ExpenseClaims");
/** Employee self-service — every staff portal has it. */
const myHr = { path: "my-hr", ...page(() => import("@/modules/hr/pages/MyHr"), "MyHr") };
const groupDashboard = page(() => import("@/modules/group/pages/GroupDashboard"), "GroupDashboard");

const site = (name: string) => page(() => import("@/modules/website/pages/SiteInfoPages"), name as "SiteAbout");

export const router = createBrowserRouter([
  // ── Public websites ────────────────────────────────────────────────────────
  { path: "/", ...page(() => import("@/modules/marketing/pages/ProductLanding"), "ProductLanding"), HydrateFallback: PageLoader },
  { path: "/privacy", lazy: async () => { const { LegalPage } = await import("@/modules/marketing/pages/LegalPage"); return { Component: () => <LegalPage kind="privacy" /> }; } },
  { path: "/terms", lazy: async () => { const { LegalPage } = await import("@/modules/marketing/pages/LegalPage"); return { Component: () => <LegalPage kind="terms" /> }; } },
  {
    path: "/school",
    lazy: async () => ({ Component: (await import("@/modules/website/SiteLayout")).SiteLayout }),
    HydrateFallback: PageLoader,
    children: [
      { index: true, ...page(() => import("@/modules/website/pages/SiteHome"), "SiteHome") },
      { path: "about", ...site("SiteAbout") },
      { path: "academics", ...site("SiteAcademics") },
      { path: "facilities", ...site("SiteFacilities") },
      { path: "student-life", ...site("SiteStudentLife") },
      { path: "gallery", ...site("SiteGallery") },
      { path: "faculty", ...site("SiteFaculty") },
      { path: "disclosure", ...page(() => import("@/modules/website/pages/SiteDisclosure"), "SiteDisclosure") },
      { path: "admissions", ...page(() => import("@/modules/website/pages/SiteAdmissions"), "SiteAdmissions") },
      { path: "notices", ...page(() => import("@/modules/website/pages/SiteEngagePages"), "SiteNotices") },
      { path: "careers", ...page(() => import("@/modules/website/pages/SiteEngagePages"), "SiteCareers") },
      { path: "alumni", ...page(() => import("@/modules/website/pages/SiteEngagePages"), "SiteAlumni") },
      { path: "contact", ...page(() => import("@/modules/website/pages/SiteEngagePages"), "SiteContact") },
    ],
  },

  // three sign-in pages: a school's people, a region office, the head office
  { path: "/login", Component: () => <Login level="school" /> },
  { path: "/login/region", Component: () => <Login level="region" /> },
  { path: "/login/head-office", Component: () => <Login level="head" /> },
  { path: "/role-select", ...page(() => import("@/modules/auth/pages/RoleSelector"), "RoleSelector") },

  // ── Leadership ─────────────────────────────────────────────────────────────
  portal("/principal", "principal", PrincipalLayout, [
    { index: true, ...P.dashboard },
    { path: "reports", ...P.reports },
    { path: "students", ...P.students },
    { path: "attendance", ...P.attendance },
    { path: "marks", ...P.marks },
    { path: "assignments", ...P.assignments },
    { path: "timetable", ...P.timetable },
    { path: "notes", ...P.notes },
    { path: "teachers", ...P.teachers },
    { path: "finance", ...P.finance },
    { path: "inventory", ...P.inventory },
    { path: "library", ...P.library },
    { path: "communication", ...P.communication },
    { path: "purchase-approvals", ...page(() => import("@/modules/procurement/pages/PurchaseApprovals"), "PrincipalPurchaseApprovals") },
    { path: "claims", ...expenseClaims },
    { path: "setup/academic-year", ...P.setupAcademicYear },
    { path: "setup/classes", ...P.setupClasses },
    { path: "setup/sections", ...P.setupSections },
    { path: "setup/students", ...P.setupStudents },
    { path: "setup/teachers", ...P.setupTeachers },
    { path: "setup/inventory", ...P.setupInventory },
    { path: "setup/parents", ...P.setupParents },
    myHr,
  ]),

  portal("/vice-principal", "viceprincipal", VicePrincipalLayout, [
    { index: true, ...P.dashboard },
    { path: "reports", ...P.reports },
    { path: "students", ...P.students },
    { path: "attendance", ...P.attendance },
    { path: "marks", ...P.marks },
    { path: "assignments", ...P.assignments },
    { path: "timetable", ...P.timetable },
    { path: "notes", ...P.notes },
    { path: "teachers", ...P.teachers },
    { path: "library", ...P.library },
    { path: "communication", ...P.communication },
    { path: "setup/students", ...P.setupStudents },
    { path: "setup/teachers", ...P.setupTeachers },
    { path: "setup/parents", ...P.setupParents },
    myHr,
  ]),

  portal("/admin", "admin", AdminLayout, [
    { index: true, ...page(() => import("@/modules/admin/pages/AdminDashboard"), "AdminDashboard") },
    { path: "users", ...page(() => import("@/modules/admin/pages/UsersAccess"), "UsersAccess") },
    { path: "roles", ...page(() => import("@/modules/admin/pages/RolesPermissions"), "RolesPermissions") },
    { path: "system", ...page(() => import("@/modules/admin/pages/SystemSettings"), "SystemSettings") },
    { path: "website", ...page(() => import("@/modules/admin/pages/WebsiteSettings"), "WebsiteSettings") },
    { path: "purchase-approvals", ...page(() => import("@/modules/procurement/pages/PurchaseApprovals"), "ManagementPurchaseApprovals") },
    { path: "group", ...groupDashboard },
  ]),

  // ── Group office: chairman, trust, group heads, regional / cluster heads ──
  portal("/group", "group", GroupLayout, [
    { index: true, ...groupDashboard },
    { path: "purchase-approvals", ...page(() => import("@/modules/procurement/pages/PurchaseApprovals"), "ManagementPurchaseApprovals") },
    myHr,
  ]),

  // ── Teaching ───────────────────────────────────────────────────────────────
  portal("/teacher", "teacher", TeacherLayout, [
    { index: true, ...page(() => import("@/modules/teacher/pages/Dashboard"), "Dashboard") },
    { path: "attendance", ...page(() => import("@/modules/teacher/pages/Attendance"), "Attendance") },
    { path: "marks", ...page(() => import("@/modules/teacher/pages/Marks"), "Marks") },
    { path: "notes", ...page(() => import("@/modules/teacher/pages/Notes"), "Notes") },
    { path: "timetable", ...page(() => import("@/modules/teacher/pages/Timetable"), "Timetable") },
    { path: "assignments", ...page(() => import("@/modules/teacher/pages/Assignments"), "Assignments") },
    { path: "students", ...page(() => import("@/modules/teacher/pages/Students"), "Students") },
    { path: "communication", ...page(() => import("@/modules/teacher/pages/Communication"), "Communication") },
    { path: "my-class", ...page(() => import("@/modules/teacher/pages/MyClass"), "MyClass") },
    { path: "department", ...page(() => import("@/modules/teacher/pages/MyDepartment"), "MyDepartment") },
    { path: "leave", ...page(() => import("@/modules/teacher/pages/MyLeave"), "MyLeave") },
    { path: "requisitions", ...page(() => import("@/modules/procurement/pages/TeacherIndents"), "TeacherIndents") },
    myHr,
  ]),

  portal("/exams", "exams", ExamsLayout, [
    { index: true, ...page(() => import("@/modules/exams/pages/ExamSchedule"), "ExamSchedule") },
    { path: "admit-cards", ...page(() => import("@/modules/exams/pages/AdmitCards"), "AdmitCards") },
    { path: "results", ...P.marks },
    myHr,
  ]),

  // ── Students & parents ─────────────────────────────────────────────────────
  portal("/student", "student", StudentLayout, studentPages),
  portal("/parent", "parent", ParentLayout, studentPages),

  // ── Office ─────────────────────────────────────────────────────────────────
  portal("/accountant", "accountant", AccountantLayout, [
    { index: true, ...page(() => import("@/modules/accounts/pages/AccountsDashboard"), "AccountsDashboard") },
    { path: "fees", ...P.finance },
    { path: "fee-structure", ...page(() => import("@/modules/accounts/pages/FeeStructure"), "FeeStructure") },
    { path: "expenses", ...page(() => import("@/modules/accounts/pages/Expenses"), "Expenses") },
    { path: "payables", ...page(() => import("@/modules/procurement/pages/AccountsPayables"), "AccountsPayables") },
    { path: "payroll", ...payroll },
    { path: "compliance", ...compliance },
    { path: "reports", ...page(() => import("@/modules/accounts/pages/AccountsReports"), "AccountsReports") },
    myHr,
  ]),

  portal("/hr", "hr", HRLayout, [
    { index: true, ...page(() => import("@/modules/hr/pages/HRDashboard"), "HRDashboard") },
    { path: "staff", ...page(() => import("@/modules/hr/pages/StaffDirectory"), "StaffDirectory") },
    { path: "leaves", ...page(() => import("@/modules/hr/pages/LeaveRequests"), "LeaveRequests") },
    { path: "recruitment", ...page(() => import("@/modules/hr/pages/Recruitment"), "Recruitment") },
    { path: "payroll", ...payroll },
    { path: "setup/teachers", ...P.setupTeachers },
    { path: "teachers", ...P.teachers },
    { path: "attendance", ...page(() => import("@/modules/hr/pages/StaffAttendance"), "StaffAttendance") },
    { path: "offers", ...page(() => import("@/modules/hr/pages/Offers"), "Offers") },
    { path: "onboarding", ...page(() => import("@/modules/hr/pages/Onboarding"), "Onboarding") },
    { path: "trainings", ...page(() => import("@/modules/hr/pages/Trainings"), "Trainings") },
    { path: "compensation", ...page(() => import("@/modules/hr/pages/Compensation"), "Compensation") },
    { path: "claims", ...expenseClaims },
    { path: "compliance", ...compliance },
    { path: "exits", ...page(() => import("@/modules/hr/pages/Separations"), "Separations") },
    { path: "settings", ...page(() => import("@/modules/hr/pages/HrSettings"), "HrSettings") },
    myHr,
  ]),

  portal("/reception", "reception", ReceptionLayout, [
    { index: true, ...page(() => import("@/modules/reception/pages/ReceptionDashboard"), "ReceptionDashboard") },
    { path: "enquiries", ...page(() => import("@/modules/reception/pages/Enquiries"), "Enquiries") },
    { path: "visitors", ...page(() => import("@/modules/reception/pages/Visitors"), "Visitors") },
    { path: "admission", ...P.setupStudents },
    { path: "students", ...page(() => import("@/modules/teacher/pages/Students"), "Students") },
    myHr,
  ]),

  // ── Facilities ─────────────────────────────────────────────────────────────
  portal("/librarian", "librarian", LibrarianLayout, [
    { index: true, ...page(() => import("@/modules/library/pages/LibraryDashboard"), "LibraryDashboard") },
    { path: "books", ...page(() => import("@/modules/library/pages/LibraryBooks"), "LibraryBooks") },
    { path: "issue-return", ...page(() => import("@/modules/library/pages/LibraryIssueReturn"), "LibraryIssueReturn") },
    { path: "members", ...page(() => import("@/modules/library/pages/LibraryMembers"), "LibraryMembers") },
    myHr,
  ]),

  portal("/inventory", "inventory", InventoryLayout, [
    { index: true, ...page(() => import("@/modules/inventory/pages/InventoryDashboard"), "InventoryDashboard") },
    { path: "items", ...page(() => import("@/modules/inventory/pages/InventoryItems"), "InventoryItems") },
    { path: "purchase", loader: () => redirect("/inventory/requisitions") },
    { path: "requisitions", ...page(() => import("@/modules/procurement/pages/Requisitions"), "Requisitions") },
    { path: "purchase-orders", ...page(() => import("@/modules/procurement/pages/PurchaseOrders"), "PurchaseOrders") },
    { path: "goods-receipts", ...page(() => import("@/modules/procurement/pages/GoodsReceipts"), "GoodsReceipts") },
    { path: "vendors", ...page(() => import("@/modules/procurement/pages/VendorMaster"), "VendorMaster") },
    { path: "categories", ...page(() => import("@/modules/inventory/pages/InventoryCategories"), "InventoryCategories") },
    { path: "reports", ...page(() => import("@/modules/inventory/pages/InventoryReports"), "InventoryReports") },
    { path: "analysis", ...page(() => import("@/modules/inventory/pages/StockAnalysis"), "StockAnalysis") },
    { path: "setup/*", ...P.setupInventory },
    myHr,
  ]),

  portal("/transport", "transport", TransportLayout, [
    { index: true, ...page(() => import("@/modules/transport/pages/TransportDashboard"), "TransportDashboard") },
    { path: "routes", ...page(() => import("@/modules/transport/pages/TransportRoutes"), "TransportRoutes") },
    { path: "vehicles", ...page(() => import("@/modules/transport/pages/Vehicles"), "Vehicles") },
    { path: "allocation", ...page(() => import("@/modules/transport/pages/TransportAllocation"), "TransportAllocation") },
    myHr,
  ]),

  portal("/hostel", "warden", HostelLayout, [
    { index: true, ...page(() => import("@/modules/hostel/pages/HostelDashboard"), "HostelDashboard") },
    { path: "rooms", ...page(() => import("@/modules/hostel/pages/HostelRooms"), "HostelRooms") },
    { path: "outpass", ...page(() => import("@/modules/hostel/pages/Outpasses"), "Outpasses") },
    myHr,
  ]),

  { path: "*", Component: NotFound },
]);
