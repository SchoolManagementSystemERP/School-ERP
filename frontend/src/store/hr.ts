import { api } from "@/api/client";
import { guidOf, maybeGuid, numId } from "@/api/ids";
import { daysUntil, today } from "@/lib/dates";
import type { Teacher } from "@/types/teacher";
import { authStore, canAny } from "./auth";
import { ifAllowed, mutate, remoteCollection, remoteStore, tempId } from "./remote";
import { monthOf } from "./finance";
import { teacherStore } from "./teachers";

// ── Non-teaching staff ───────────────────────────────────────────────────────

export interface StaffMember {
  id: number;
  empId: string;
  name: string;
  designation: string;
  department: string;
  phone: string;
  email: string;
  /** YYYY-MM-DD */
  joiningDate: string;
  /** Monthly gross salary (₹) */
  salary: number;
  status: "Active" | "On Leave" | "Resigned";
}

interface ApiStaff {
  id: string; employeeCode: string; name: string; designation: string; department: string | null; phone?: string | null; email?: string | null;
  joiningDate?: string | null; status: string; staffType: string; basicSalary?: number | null; allowances?: Record<string, number | null> | null;
}
const STAFF_STATUS: Record<string, StaffMember["status"]> = { ACTIVE: "Active", ON_LEAVE: "On Leave", RESIGNED: "Resigned", SUSPENDED: "On Leave" };
const toStaff = (s: ApiStaff): StaffMember => ({
  id: numId("staff", s.id), empId: s.employeeCode, name: s.name, designation: s.designation, department: s.department ?? "",
  phone: s.phone ?? "", email: s.email ?? "", joiningDate: s.joiningDate ?? "", status: STAFF_STATUS[s.status] ?? "Active",
  salary: Number(s.basicSalary ?? 0) + Object.values(s.allowances ?? {}).reduce<number>((t, v) => t + Number(v ?? 0), 0),
});
const staffApi = (m: Omit<StaffMember, "id">) => ({
  employeeCode: m.empId, name: m.name.trim(), designation: m.designation.trim(), department: m.department.trim() || null, staffType: "NON_TEACHING",
  phone: m.phone || null, email: m.email || "", joiningDate: m.joiningDate || null, status: m.status === "On Leave" ? "ON_LEAVE" : m.status.toUpperCase(),
  basicSalary: m.salary, allowances: null,
});

const staffBase = remoteCollection<StaffMember>("staff", async () => (await ifAllowed(api.get<ApiStaff[]>("/staff?type=NON_TEACHING"), [])).map(toStaff));

/** Non-teaching staff, from the API (GET /staff?type=NON_TEACHING). Salary is the consolidated monthly gross. */
export const staffStore = Object.assign(staffBase, {
  add(record: Omit<StaffMember, "id">): StaffMember {
    const id = tempId();
    const created = { ...record, id };
    void mutate(staffBase, (l) => [...l, created], async () => {
      const res = await api.post<ApiStaff>("/staff", staffApi(record));
      staffBase.set((l) => l.map((x) => (x.id === id ? toStaff(res) : x)));
    });
    return created;
  },
  update(record: StaffMember) {
    void mutate(staffBase, (l) => l.map((x) => (x.id === record.id ? record : x)), () => api.patch(`/staff/${guidOf("staff", record.id)}`, staffApi(record)));
  },
  /** Staff are never deleted — they are marked as resigned. */
  remove(id: number) {
    void mutate(staffBase, (l) => l.filter((x) => x.id !== id), () => api.patch(`/staff/${guidOf("staff", id)}`, { status: "RESIGNED" }));
  },
});
export const useStaff = () => staffBase.useItems();

// ── Leave requests ───────────────────────────────────────────────────────────

export interface LeaveRequest {
  id: number;
  person: { kind: "teacher" | "staff"; id: number; name: string };
  type: "Casual" | "Sick" | "Earned" | "Maternity" | "Unpaid";
  from: string;
  to: string;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  appliedOn: string;
  decidedOn?: string;
}

export const LEAVE_TYPES: LeaveRequest["type"][] = ["Casual", "Sick", "Earned", "Maternity", "Unpaid"];

interface ApiLeave { id: string; staffId: string; staffName: string; staffType: string; type: string; fromDate: string; toDate: string; reason: string; status: string; decidedAt: string | null; createdAt: string }
const title = (v: string) => v.charAt(0) + v.slice(1).toLowerCase();
const toLeave = (l: ApiLeave): LeaveRequest => ({
  id: numId("leave", l.id),
  person: { kind: l.staffType === "TEACHING" ? "teacher" : "staff", id: numId("staff", l.staffId), name: l.staffName },
  type: title(l.type) as LeaveRequest["type"], from: l.fromDate, to: l.toDate, reason: l.reason,
  status: title(l.status) as LeaveRequest["status"], appliedOn: l.createdAt, ...(l.decidedAt ? { decidedOn: l.decidedAt } : {}),
});

/** Leave requests, from the API (GET /leaves): HR and the principal see everyone's, staff their own. */
export const leaveStore = remoteStore<LeaveRequest[]>("leaves", [], async () =>
  canAny("leave.approve", "staff.read") || authStore.get().me?.staff ? (await ifAllowed(api.get<ApiLeave[]>("/leaves"), [])).map(toLeave) : []);
export const useLeaves = () => leaveStore.useValue();

export const leaveDays = (l: Pick<LeaveRequest, "from" | "to">) => Math.max(1, daysUntil(l.to) - daysUntil(l.from) + 1);

/** Applies for leave (for yourself; HR may apply for a colleague). Returns a validation message, or null when sent. */
export function applyLeave(l: Omit<LeaveRequest, "id" | "status" | "appliedOn">): string | null {
  if (l.to < l.from) return "End date must be on or after the start date";
  if (!l.reason.trim()) return "Please give a reason";
  const id = tempId();
  void mutate(leaveStore, (list): LeaveRequest[] => [{ ...l, id, status: "Pending", appliedOn: today() }, ...list], async () => {
    const saved = await api.post<ApiLeave>("/leaves", { staffId: maybeGuid("staff", l.person.id), type: l.type.toUpperCase(), fromDate: l.from, toDate: l.to, reason: l.reason.trim() });
    leaveStore.set((list) => list.map((x) => (x.id === id ? toLeave(saved) : x)));
  });
  return null;
}

export function decideLeave(id: number, status: "Approved" | "Rejected") {
  void mutate(leaveStore, (list) => list.map((l) => (l.id === id ? { ...l, status, decidedOn: today() } : l)), () =>
    api.patch(`/leaves/${guidOf("leave", id)}`, { status: status.toUpperCase() }));
}

/** Whether someone is on approved leave today. */
export const onLeaveToday = (leaves: LeaveRequest[], kind: "teacher" | "staff", id: number) =>
  leaves.some((l) => l.status === "Approved" && l.person.kind === kind && l.person.id === id && l.from <= today() && l.to >= today());

// ── Payroll ──────────────────────────────────────────────────────────────────

export interface PayslipLine {
  kind: "teacher" | "staff";
  id: number;
  empId: string;
  name: string;
  designation: string;
  gross: number;
  /** PF + professional tax */
  deductions: number;
  net: number;
}

export interface PayrollRun {
  /** YYYY-MM */
  month: string;
  lines: PayslipLine[];
  processedOn: string;
  paidOn?: string;
}

const num = (v: string) => Number(v) || 0;
const PROFESSIONAL_TAX = 200;

export function teacherPayslip(t: Teacher): PayslipLine {
  const gross = num(t.basicSalary) + num(t.hra) + num(t.da) + num(t.ta) + num(t.otherAllowances);
  const deductions = Math.round(num(t.basicSalary) * 0.12) + PROFESSIONAL_TAX;
  return { kind: "teacher", id: t.id, empId: t.empId, name: t.name, designation: t.designation, gross, deductions, net: gross - deductions };
}

export function staffPayslip(s: StaffMember): PayslipLine {
  // basic is taken as half of gross for PF
  const deductions = Math.round(s.salary * 0.5 * 0.12) + PROFESSIONAL_TAX;
  return { kind: "staff", id: s.id, empId: s.empId, name: s.name, designation: s.designation, gross: s.salary, deductions, net: s.salary - deductions };
}

/** Payslips for everyone currently employed. */
export function currentPayslips(): PayslipLine[] {
  return [
    ...teacherStore.getAll().filter((t) => t.status !== "Resigned").map(teacherPayslip),
    ...staffStore.getAll().filter((s) => s.status !== "Resigned").map(staffPayslip),
  ];
}

interface ApiRun { month: string; status: string; processedAt: string; paidAt: string | null; payslips: { staffId: string; employeeCode: string; name: string; designation: string; staffType: string; gross: number; deductions: number; net: number }[] }
const toRun = (r: ApiRun): PayrollRun => ({
  month: r.month, processedOn: r.processedAt, ...(r.paidAt ? { paidOn: r.paidAt } : {}),
  lines: r.payslips.map((p) => ({ kind: p.staffType === "TEACHING" ? "teacher" : "staff", id: numId("staff", p.staffId), empId: p.employeeCode, name: p.name, designation: p.designation, gross: p.gross, deductions: p.deductions, net: p.net })),
});

/** Payroll runs, from the API (GET /payroll). */
export const payrollStore = remoteStore<PayrollRun[]>("payroll", [], async () =>
  canAny("payroll.run", "reports.view") ? (await ifAllowed(api.get<ApiRun[]>("/payroll"), [])).map(toRun) : []);
export const usePayroll = () => payrollStore.useValue();

/** Processes payroll for a month; the server computes the payslips from the salary structure. */
export function processPayroll(month = monthOf()): PayrollRun {
  const run: PayrollRun = { month, lines: currentPayslips(), processedOn: today() };
  void mutate(payrollStore, (list) => [...list.filter((r) => r.month !== month), run].sort((a, b) => a.month.localeCompare(b.month)), () => api.post(`/payroll/${month}/process`, {}), { reload: true });
  return run;
}

export function markPayrollPaid(month: string) {
  void mutate(payrollStore, (list) => list.map((r) => (r.month === month ? { ...r, paidOn: today() } : r)), () => api.post(`/payroll/${month}/pay`, {}));
}
